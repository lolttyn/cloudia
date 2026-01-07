/**
 * Phase D2.2 — Test-only hydration helpers for parity comparison
 * 
 * These utilities hydrate bundle refs to full bundles for strict parity testing.
 * Uses the shared production hydrator to ensure parity tests and production
 * boundary use the same hydration logic.
 */

import { buildBundleIndex, hydrateInterpretationBundleRefs } from "../hydrateBundles.js";
import type { InterpretationBundle } from "../../../canon/machine/bundles/interpretation_bundle_schema.js";
import type { DailyInterpretation } from "../schema/dailyInterpretation.schema.js";

/**
 * Hydrate DailyInterpretation refs to full bundles for parity comparison
 * 
 * Takes a DailyInterpretation with refs and returns a new object with full bundles
 * in the same shape as legacy InterpretiveFrame.
 * 
 * Uses the shared production hydrator to ensure test and production hydration
 * logic stays in sync.
 * 
 * @param dailyInterpretation - DailyInterpretation with bundle refs
 * @param bundleIndex - Flat index of bundles by slug (from buildBundleIndex())
 * @returns Object with interpretation_bundles hydrated to full bundles
 */
export function hydrateDailyInterpretationBundles(
  dailyInterpretation: DailyInterpretation,
  bundleIndex: Map<string, InterpretationBundle>
): {
  interpretation_bundles: {
    primary: InterpretationBundle[];
    secondary: InterpretationBundle[];
    suppressed: typeof dailyInterpretation.interpretation_bundles.suppressed;
  };
} {
  return {
    interpretation_bundles: {
      primary: hydrateInterpretationBundleRefs(
        dailyInterpretation.interpretation_bundles.primary,
        bundleIndex
      ),
      secondary: hydrateInterpretationBundleRefs(
        dailyInterpretation.interpretation_bundles.secondary,
        bundleIndex
      ),
      suppressed: dailyInterpretation.interpretation_bundles.suppressed,
    },
  };
}

// Re-export shared functions for convenience in tests
export { buildBundleIndex, hydrateInterpretationBundleRefs };
