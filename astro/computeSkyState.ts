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

export interface ComputeSkyStateInput {
  date: string; // YYYY-MM-DD
  timezone: "UTC";
}

/**
 * Compute the canonical sky_state for a given date.
 *
 * NOTE:
 * This function is intentionally unimplemented.
 * Swiss Ephemeris integration will be added in a later phase.
 */
export async function computeSkyState(
  _input: ComputeSkyStateInput
): Promise<never> {
  throw new Error(
    "computeSkyState is not implemented yet. " +
      "Swiss Ephemeris integration will be added in Phase 2.4."
  );
}

