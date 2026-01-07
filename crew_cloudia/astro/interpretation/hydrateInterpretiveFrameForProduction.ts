/**
 * Phase D2 — Production boundary: Hydrate DailyInterpretation → InterpretiveFrame
 * 
 * PRODUCTION BOUNDARY: This is the single location where canonical refs are
 * hydrated to full bundles for downstream consumers that expect InterpretiveFrame.
 * 
 * When production switches from legacy `runInterpreter()` to canonical path:
 * 1. Replace `runInterpreter()` call in `runner/runEpisodeBatch.ts` with this function
 * 2. This function takes `DailyInterpretation` (refs) and returns `InterpretiveFrame` (full bundles)
 * 3. All downstream code continues to work unchanged
 * 
 * Architecture:
 * - Upstream: `deriveDailyInterpretation()` → `DailyInterpretation` (refs only, persisted)
 * - Boundary: This function → `InterpretiveFrame` (full bundles, for consumers)
 * - Downstream: `evaluateSegmentWithFrame()`, `buildSegmentPrompt()`, etc. (expect full bundles)
 */

import { type DailyInterpretation } from "./schema/dailyInterpretation.schema.js";
import { InterpretiveFrameSchema, type InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { buildBundleIndex, hydrateInterpretationBundleRefs } from "./hydrateBundles.js";
import { transformToInterpretiveFrame } from "./transformToInterpretiveFrame.js";

/**
 * PRODUCTION BOUNDARY: Hydrate DailyInterpretation (refs) → InterpretiveFrame (full bundles)
 * 
 * This is the single location where canonical refs are hydrated to full bundles
 * for downstream consumers that expect InterpretiveFrame.
 * 
 * When production switches from legacy `runInterpreter()` to canonical path:
 * 1. Replace `runInterpreter()` call in `runner/runEpisodeBatch.ts` with this function
 * 2. This function takes `DailyInterpretation` (refs) and returns `InterpretiveFrame` (full bundles)
 * 3. All downstream code continues to work unchanged
 * 
 * Architecture:
 * - Upstream: `deriveDailyInterpretation()` → `DailyInterpretation` (refs only, persisted)
 * - Boundary: This function → `InterpretiveFrame` (full bundles, for consumers)
 * - Downstream: `evaluateSegmentWithFrame()`, `buildSegmentPrompt()`, etc. (expect full bundles)
 * 
 * Usage in production (when switching from legacy):
 * ```ts
 * // In runner/runEpisodeBatch.ts, replace:
 * // const interpretive_frame = await runInterpreter({ date: episode_date });
 * 
 * // With:
 * const inputs = await loadInterpretationInputs(episode_date, { semantics: "require" });
 * const dailyInterpretation = await deriveDailyInterpretation(inputs);
 * const interpretive_frame = await hydrateInterpretiveFrameForProduction(dailyInterpretation);
 * ```
 * 
 * @param dailyInterpretation - Canonical DailyInterpretation with bundle refs
 * @returns InterpretiveFrame with full bundles (for downstream consumers)
 */
export async function hydrateInterpretiveFrameForProduction(
  dailyInterpretation: DailyInterpretation
): Promise<InterpretiveFrame> {
  // Use the core transformer for all field transformations
  // It hydrates bundles for InterpretiveFrame schema compatibility
  // This ensures the same transformation logic is used in tests and production
  // NOTE: transformToInterpretiveFrame is currently test-only but will be used here
  // when production switches to canonical path
  return transformToInterpretiveFrame(dailyInterpretation);
}

