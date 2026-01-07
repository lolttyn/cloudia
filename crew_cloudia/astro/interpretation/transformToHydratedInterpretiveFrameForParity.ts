/**
 * Phase D2.2 — Hydrated InterpretiveFrame transformer for parity tests
 * 
 * TEST-ONLY: This function explicitly hydrates bundle refs to full bundles
 * for strict parity comparison with legacy output.
 * 
 * This makes hydration explicit and test-only, separate from the core
 * transformer which should ideally pass refs through.
 */

import { type DailyInterpretation } from "./schema/dailyInterpretation.schema.js";
import { type InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { transformToInterpretiveFrame } from "./transformToInterpretiveFrame.js";

/**
 * Transform DailyInterpretation to InterpretiveFrame with explicit hydration
 * 
 * TEST-ONLY: This function explicitly hydrates bundle refs to full bundles
 * for strict parity comparison with legacy output.
 * 
 * This makes hydration explicit and test-only. The core `transformToInterpretiveFrame()`
 * also hydrates (for InterpretiveFrame schema compatibility), but this function
 * makes it explicit that hydration is for parity testing purposes.
 * 
 * @param dailyInterpretation - Canonical Layer 2 meaning object with bundle refs
 * @returns InterpretiveFrame with full bundles (for parity comparison)
 */
export function transformToHydratedInterpretiveFrameForParity(
  dailyInterpretation: DailyInterpretation
): InterpretiveFrame {
  // Use the core transformer (it already hydrates for InterpretiveFrame compatibility)
  // This wrapper makes it explicit that hydration is for parity testing
  return transformToInterpretiveFrame(dailyInterpretation);
}

