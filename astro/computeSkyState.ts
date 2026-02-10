/**
 * Layer 0 — Astronomical Source of Truth
 *
 * This module is responsible for computing the canonical sky_state
 * as defined in docs/sky_state.md.
 *
 * IMPORTANT:
 * - No astrology logic
 * - No interpretation
 * - No agents
 * - Deterministic outputs only
 */

import {
  calcBody,
  julianDayFor,
  getEngineVersion,
  getEphemerisFileset,
} from "./ephemeris/swisseph";
import { computeAspects } from "./computeAspects.js";
import { computeLunarPhase } from "./computeLunar.js";

export interface ComputeSkyStateInput {
  date: string; // YYYY-MM-DD
  timezone: "UTC";
}

/** End-of-day UTC (23:59:59) so ingresses during the US day are captured for that calendar date. */
const END_OF_DAY_UTC = 23 + 59 / 60 + 59 / 3600;

const BODY_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

function normalizeDegrees(value: number) {
  let v = value % 360;
  if (v < 0) v += 360;
  return v;
}

export async function computeSkyState(input: ComputeSkyStateInput) {
  if (input.timezone !== "UTC") {
    throw new Error("Only UTC timezone is supported");
  }

  const date = input.date;
  const jd = julianDayFor(date, END_OF_DAY_UTC); // 23:59 UTC — captures ingresses during US day
  const timestampGenerated = new Date().toISOString();

  // Get metadata (deterministic)
  const engineVersion = getEngineVersion();
  const ephemerisFileset = getEphemerisFileset();

  const bodies: Record<
    string,
    {
      longitude: number;
      speed_deg_per_day: number;
      retrograde: boolean;
      sign: string;
      sign_degree: number;
      latitude?: number;
      distance_au?: number;
    }
  > = {};

  for (const body of BODY_ORDER) {
    const result = calcBody(jd, body);
    const longitude = normalizeDegrees(result.longitude);
    const signIndex = Math.floor(longitude / 30);
    const signDegree = longitude - signIndex * 30;

    bodies[body] = {
      longitude,
      speed_deg_per_day: result.speed_deg_per_day,
      retrograde: result.retrograde,
      sign: SIGNS[signIndex],
      sign_degree: signDegree,
      latitude: result.latitude,
      distance_au: result.distance_au,
    };
  }

  // Compute aspects between all body pairs
  const aspects = computeAspects(bodies, 10); // 10 degree max orb

  // Compute lunar phase data
  const lunar = computeLunarPhase(
    bodies.sun.longitude,
    bodies.moon.longitude
  );

  return {
    schema_version: "1.1.0",
    meta: {
      engine: "swisseph",
      engine_version: engineVersion,
      ephemeris_fileset: ephemerisFileset,
      coordinate_system: "tropical",
      timestamp_generated: timestampGenerated,
    },
    timestamp: {
      date,
      utc_datetime: `${date}T23:59:59.000Z`,
      timezone: "UTC",
      julian_day: jd,
    },
    bodies,
    aspects,
    lunar,
  };
}

