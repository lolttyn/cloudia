/**
 * Phase 5.1 — Layer 2 Inputs Loader
 * 
 * Loads canonical Layer 0 (SkyStateDaily) and Layer 1 (DailyFacts) data
 * with require semantics. No computation on miss in Phase 5.1.
 */

import { loadSkyStateDaily } from "../ephemeris/persistence/loadSkyStateDaily.js";
import { loadDailyFacts } from "../technician/persistence/loadDailyFacts.js";
import { SkyState } from "../../../astro/schemas/skyState.schema.js";
import { DailyFacts } from "../technician/schema/dailyFacts.schema.js";
import { MissingSkyStateError, MissingDailyFactsError } from "./errors.js";

export type InterpretationInputs = {
  timestamp: {
    date: string; // YYYY-MM-DD (the "episode day")
    timezone: string; // e.g. "UTC"
    canonical_utc_datetime: string; // e.g. 12:00Z anchor if that is the canon
  };

  // Provenance: these must be loadable deterministically
  sky_state: SkyState; // Layer 0 persisted
  daily_facts: DailyFacts; // Layer 1 derived from persisted sky_state

  // Optional in Phase 5.1; keep empty to avoid behavior changes
  meta?: {
    sky_state_version?: string;
    daily_facts_policy_version?: string;
  };
};

/**
 * Layer 2 canonical loader
 * 
 * @param date - YYYY-MM-DD
 * @param opts - Optional timezone (default "UTC") and semantics (default "require")
 * @returns InterpretationInputs with required Layer 0 + Layer 1 data
 * @throws MissingSkyStateError if sky_state is missing
 * @throws MissingDailyFactsError if daily_facts is missing
 */
export async function loadInterpretationInputs(
  date: string,
  opts?: {
    timezone?: string; // default "UTC" unless you have a canonical rule already
    semantics?: "require"; // Phase 5.1 is require-only
  }
): Promise<InterpretationInputs> {
  const timezone = opts?.timezone ?? "UTC";
  const semantics = opts?.semantics ?? "require";

  if (semantics !== "require") {
    throw new Error(`Phase 5.1 only supports "require" semantics, got: ${semantics}`);
  }

  // Load Layer 0: SkyStateDaily
  const skyState = await loadSkyStateDaily(date);
  if (!skyState) {
    throw new MissingSkyStateError(date);
  }

  // Load Layer 1: DailyFacts
  const dailyFacts = await loadDailyFacts(date);
  if (!dailyFacts) {
    throw new MissingDailyFactsError(date);
  }

  // Extract canonical UTC datetime from sky_state (12:00 UTC anchor)
  const canonical_utc_datetime = skyState.timestamp.utc_datetime;

  return {
    timestamp: {
      date,
      timezone,
      canonical_utc_datetime,
    },
    sky_state: skyState,
    daily_facts: dailyFacts,
    meta: {
      sky_state_version: skyState.schema_version,
      daily_facts_policy_version: dailyFacts.technician_policy_version,
    },
  };
}

