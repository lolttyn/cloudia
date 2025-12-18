import { computeSkyState } from "../../../astro/computeSkyState.js";

export type SkyAspect =
  | {
      type: "aspect";
      bodies: ["Sun", "Moon"];
      aspect: "conjunction" | "sextile" | "square" | "trine" | "opposition";
      orb_deg: number;
    }
  | {
      type: "ingress";
      body: "Moon";
      from_sign: string;
      to_sign: string;
      window: "past_24h" | "next_24h";
    };

export type SkyFeatures = {
  date: string; // YYYY-MM-DD
  sun: { sign: string };
  moon: { sign: string; phase: "new" | "waxing" | "full" | "waning" };
  highlights: SkyAspect[];
};

const MAJOR_ASPECTS = [
  { name: "conjunction", angle: 0 },
  { name: "sextile", angle: 60 },
  { name: "square", angle: 90 },
  { name: "trine", angle: 120 },
  { name: "opposition", angle: 180 },
] as const;

const SUN_MOON_ORB_DEG = 6; // bounded, deterministic orb threshold

function titleCase(sign: string): string {
  if (!sign) return sign;
  return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
}

function normalizeDeg(value: number) {
  let v = value % 360;
  if (v < 0) v += 360;
  return v;
}

function angularSeparation(a: number, b: number) {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
}

function deriveMoonPhase(sunLon: number, moonLon: number): SkyFeatures["moon"]["phase"] {
  const sep = angularSeparation(sunLon, moonLon);
  if (sep < 45) return "new";
  if (sep < 135) return "waxing";
  if (sep < 225) return "full";
  if (sep < 315) return "waning";
  return "new";
}

function detectSunMoonAspect(
  sunLon: number,
  moonLon: number
): SkyAspect | undefined {
  const sep = angularSeparation(sunLon, moonLon);

  let best:
    | {
        aspect: SkyAspect & { type: "aspect" };
        diff: number;
      }
    | undefined;

  for (const aspect of MAJOR_ASPECTS) {
    const diff = Math.abs(sep - aspect.angle);
    if (diff <= SUN_MOON_ORB_DEG) {
      if (!best || diff < best.diff) {
        best = {
          aspect: {
            type: "aspect",
            bodies: ["Sun", "Moon"],
            aspect: aspect.name,
            orb_deg: Number(diff.toFixed(2)),
          },
          diff,
        };
      }
    }
  }

  return best?.aspect;
}

function offsetDate(base: string, deltaDays: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to extractSkyFeatures: ${base}`);
  }
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export async function extractSkyFeatures(input: { date: string }): Promise<SkyFeatures> {
  const today = await computeSkyState({ date: input.date, timezone: "UTC" });

  const sunSign = titleCase(today.bodies.sun.sign);
  const moonSign = titleCase(today.bodies.moon.sign);
  const moonPhase = deriveMoonPhase(
    today.bodies.sun.longitude,
    today.bodies.moon.longitude
  );

  const highlights: SkyAspect[] = [];

  const sunMoonAspect = detectSunMoonAspect(
    today.bodies.sun.longitude,
    today.bodies.moon.longitude
  );
  if (sunMoonAspect) {
    highlights.push(sunMoonAspect);
  }

  // Check for a Moon ingress within a 24h window (coarse but deterministic).
  const prevDate = offsetDate(input.date, -1);
  const nextDate = offsetDate(input.date, 1);
  const [prev, next] = await Promise.all([
    computeSkyState({ date: prevDate, timezone: "UTC" }),
    computeSkyState({ date: nextDate, timezone: "UTC" }),
  ]);

  if (titleCase(prev.bodies.moon.sign) !== moonSign) {
    highlights.push({
      type: "ingress",
      body: "Moon",
      from_sign: titleCase(prev.bodies.moon.sign),
      to_sign: moonSign,
      window: "past_24h",
    });
  } else if (titleCase(next.bodies.moon.sign) !== moonSign) {
    highlights.push({
      type: "ingress",
      body: "Moon",
      from_sign: moonSign,
      to_sign: titleCase(next.bodies.moon.sign),
      window: "next_24h",
    });
  }

  return {
    date: input.date,
    sun: { sign: sunSign },
    moon: { sign: moonSign, phase: moonPhase },
    highlights,
  };
}

