/**
 * Pure functions for computing lunar phase data.
 * Layer 0: No interpretation, only geometric calculations.
 */

export type LunarPhaseName =
  | "new"
  | "waxing_crescent"
  | "first_quarter"
  | "waxing_gibbous"
  | "full"
  | "waning_gibbous"
  | "last_quarter"
  | "waning_crescent";

export interface LunarPhase {
  phase_name: LunarPhaseName;
  phase_angle_deg: number;
  illumination_pct: number;
}

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
 * Compute lunar phase name from sun-moon elongation angle.
 * 
 * Phase boundaries (approximate):
 * - 0°: New Moon
 * - 45°: Waxing Crescent
 * - 90°: First Quarter
 * - 135°: Waxing Gibbous
 * - 180°: Full Moon
 * - 225°: Waning Gibbous
 * - 270°: Last Quarter
 * - 315°: Waning Crescent
 */
function phaseNameFromAngle(angleDeg: number): LunarPhaseName {
  // Normalize to 0-360
  const angle = normalizeDegrees(angleDeg);

  if (angle < 22.5 || angle >= 337.5) {
    return "new";
  } else if (angle < 67.5) {
    return "waxing_crescent";
  } else if (angle < 112.5) {
    return "first_quarter";
  } else if (angle < 157.5) {
    return "waxing_gibbous";
  } else if (angle < 202.5) {
    return "full";
  } else if (angle < 247.5) {
    return "waning_gibbous";
  } else if (angle < 292.5) {
    return "last_quarter";
  } else {
    return "waning_crescent";
  }
}

/**
 * Compute percent illumination from phase angle (sun-moon elongation).
 * 
 * Formula: illumination = (1 - cos(phase_angle)) / 2 * 100
 * 
 * The phase angle is the angular separation between sun and moon:
 * - 0° = New Moon (sun and moon same longitude) → 0% illumination
 * - 180° = Full Moon (sun and moon 180° apart) → 100% illumination
 * 
 * This follows the standard astronomical formula for lunar illumination.
 */
function illuminationFromPhaseAngle(phaseAngleDeg: number): number {
  const phaseAngleRad = (phaseAngleDeg * Math.PI) / 180;
  const illumination = (1 - Math.cos(phaseAngleRad)) / 2;
  return Number((illumination * 100).toFixed(2));
}

/**
 * Compute lunar phase data from sun and moon longitudes.
 * 
 * @param sunLongitude - Sun's ecliptic longitude in degrees
 * @param moonLongitude - Moon's ecliptic longitude in degrees
 * @returns Lunar phase data
 */
export function computeLunarPhase(
  sunLongitude: number,
  moonLongitude: number
): LunarPhase {
  // Phase angle is the angular separation (elongation)
  const phaseAngleDeg = angularSeparation(sunLongitude, moonLongitude);
  const phaseName = phaseNameFromAngle(phaseAngleDeg);
  const illuminationPct = illuminationFromPhaseAngle(phaseAngleDeg);

  return {
    phase_name: phaseName,
    phase_angle_deg: Number(phaseAngleDeg.toFixed(4)),
    illumination_pct: illuminationPct,
  };
}

