import { SkyFeatures } from "../sky/extractSkyFeatures.js";
import {
  moonIngressKey,
  moonPhaseKey,
  sunInSignKey,
  sunMoonAspectKey,
  moonInSignKey,
  newMoonKey,
  fullMoonKey,
} from "./signalKeys.js";
import {
  InterpretationSignal,
} from "./signals.schema.js";

const ORB_MAX = 6;
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

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function aspectSalience(orbDeg: number): number {
  return clamp01(1 - orbDeg / ORB_MAX);
}

function moonPhaseSalience(phase: SkyFeatures["moon"]["phase"]): number {
  if (phase === "new" || phase === "full") return 0.45;
  return 0.25;
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

function isOppositeSign(a: string, b: string): boolean {
  const ai = SIGNS.indexOf(a.toLowerCase());
  const bi = SIGNS.indexOf(b.toLowerCase());
  if (ai === -1 || bi === -1) return false;
  return (ai + 6) % 12 === bi;
}

export function deriveSignalsFromSkyFeatures(
  features: SkyFeatures
): InterpretationSignal[] {
  const signals: InterpretationSignal[] = [];

  // Sun in sign
  signals.push({
    signal_key: sunInSignKey(features.sun.sign),
    kind: "planet_in_sign",
    salience: 0.35,
    source: "sky_features",
    meta: { sign: features.sun.sign.toLowerCase(), body: "sun" },
  });

  // Moon in sign
  signals.push({
    signal_key: moonInSignKey(features.moon.sign),
    kind: "planet_in_sign",
    salience: 0.3,
    source: "sky_features",
    meta: { sign: features.moon.sign.toLowerCase(), body: "moon", phase: features.moon.phase },
  });

  // Moon phase
  signals.push({
    signal_key: moonPhaseKey(features.moon.phase),
    kind: "lunar_phase",
    salience: moonPhaseSalience(features.moon.phase),
    source: "sky_features",
    meta: { phase: features.moon.phase },
  });

  // Lunation detection: high-salience, single-dominant triggers.
  const elongation = angularSeparation(features.sun.longitude, features.moon.longitude);
  if (features.moon.phase === "new" && features.sun.sign === features.moon.sign) {
    signals.push({
      signal_key: newMoonKey(features.sun.sign),
      kind: "lunation",
      salience: 0.95,
      source: "sky_features",
      meta: { sign: features.sun.sign.toLowerCase(), phase: "new", elongation_deg: Number(elongation.toFixed(2)) },
    });
  } else if (features.moon.phase === "full" && isOppositeSign(features.sun.sign, features.moon.sign)) {
    signals.push({
      signal_key: fullMoonKey(features.moon.sign),
      kind: "lunation",
      salience: 0.95,
      source: "sky_features",
      meta: { sign: features.moon.sign.toLowerCase(), phase: "full", elongation_deg: Number(elongation.toFixed(2)) },
    });
  }

  for (const highlight of features.highlights) {
    if (highlight.type === "aspect") {
      signals.push({
        signal_key: sunMoonAspectKey(highlight.aspect),
        kind: "aspect",
        salience: aspectSalience(highlight.orb_deg),
        source: "sky_features",
        orb_deg: highlight.orb_deg,
        meta: { aspect: highlight.aspect, bodies: highlight.bodies },
      });
    } else if (highlight.type === "ingress") {
      signals.push({
        signal_key: moonIngressKey(highlight.to_sign, highlight.window),
        kind: "ingress",
        salience: 0.2,
        source: "sky_features",
        meta: {
          body: highlight.body,
          from_sign: highlight.from_sign,
          to_sign: highlight.to_sign,
          window: highlight.window,
        },
      });
    }
  }

  return signals.sort((a, b) => {
    if (b.salience !== a.salience) {
      return b.salience - a.salience;
    }
    return a.signal_key.localeCompare(b.signal_key);
  });
}

