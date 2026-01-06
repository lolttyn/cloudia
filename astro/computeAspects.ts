/**
 * Pure functions for computing aspects between celestial bodies.
 * Layer 0: No interpretation, only geometric relationships.
 */

export type AspectType =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition";

export interface Aspect {
  body_a: string;
  body_b: string;
  type: AspectType;
  orb_deg: number;
}

const MAJOR_ASPECTS: Array<{ name: AspectType; angle: number }> = [
  { name: "conjunction", angle: 0 },
  { name: "sextile", angle: 60 },
  { name: "square", angle: 90 },
  { name: "trine", angle: 120 },
  { name: "opposition", angle: 180 },
] as const;

/**
 * Normalize degrees to 0-360 range
 */
function normalizeDegrees(value: number): number {
  let v = value % 360;
  if (v < 0) v += 360;
  return v;
}

/**
 * Compute angular separation between two longitudes (0-180 degrees)
 */
function angularSeparation(lon1: number, lon2: number): number {
  const diff = Math.abs(normalizeDegrees(lon1) - normalizeDegrees(lon2));
  return Math.min(diff, 360 - diff);
}

/**
 * Check if two bodies form an aspect within the given orb tolerance.
 * Returns the aspect type and orb if found, null otherwise.
 */
function detectAspect(
  lon1: number,
  lon2: number,
  maxOrbDeg: number
): { type: AspectType; orb_deg: number } | null {
  const sep = angularSeparation(lon1, lon2);

  let best: { type: AspectType; orb_deg: number } | null = null;
  let bestDiff = Infinity;

  for (const aspect of MAJOR_ASPECTS) {
    const diff = Math.abs(sep - aspect.angle);
    if (diff <= maxOrbDeg && diff < bestDiff) {
      best = { type: aspect.name, orb_deg: Number(diff.toFixed(4)) };
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * Compute all aspects between all body pairs.
 * 
 * @param bodies - Map of body name to longitude (degrees)
 * @param maxOrbDeg - Maximum orb tolerance in degrees (default: 10)
 * @returns Array of aspects, sorted by body_a, then body_b
 */
export function computeAspects(
  bodies: Record<string, { longitude: number }>,
  maxOrbDeg: number = 10
): Aspect[] {
  const aspects: Aspect[] = [];
  const bodyNames = Object.keys(bodies).sort(); // Deterministic ordering

  // Check all pairs (avoid duplicates: only check a < b)
  for (let i = 0; i < bodyNames.length; i++) {
    const bodyA = bodyNames[i];
    const lonA = bodies[bodyA]?.longitude;
    if (lonA === undefined) continue;

    for (let j = i + 1; j < bodyNames.length; j++) {
      const bodyB = bodyNames[j];
      const lonB = bodies[bodyB]?.longitude;
      if (lonB === undefined) continue;

      const aspect = detectAspect(lonA, lonB, maxOrbDeg);
      if (aspect) {
        aspects.push({
          body_a: bodyA,
          body_b: bodyB,
          type: aspect.type,
          orb_deg: aspect.orb_deg,
        });
      }
    }
  }

  // Sort for deterministic output
  aspects.sort((a, b) => {
    if (a.body_a !== b.body_a) {
      return a.body_a.localeCompare(b.body_a);
    }
    return a.body_b.localeCompare(b.body_b);
  });

  return aspects;
}

