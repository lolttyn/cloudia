/**
 * Phase 5.2 — Legacy vs Canonical Parity Tests
 * 
 * These tests compare the legacy interpreter output with the new canonical path
 * to ensure no behavior change when switching production.
 * 
 * Test 1: Informational snapshot (always runs, logs diffs, never fails)
 * Test 2: Strict equivalence gate (gated until parity is achieved)
 */

import { describe, it, expect } from "vitest";
import { runInterpreter } from "../../../interpretation/runInterpreter.js";
import { runCanonicalMeaningToFrameForTest } from "./testHelpers.js";
import { InterpretiveFrameSchema } from "../../../interpretation/schema/InterpretiveFrame.js";
import { buildBundleIndex } from "../hydrateBundles.js";
import { hydrateDailyInterpretationBundles } from "./hydrateBundlesForParity.js";
import { loadInterpretationInputs } from "../loadInterpretationInputs.js";
import { deriveDailyInterpretation } from "../deriveDailyInterpretation.js";

const TEST_DATE = "2024-01-15";

/**
 * Deep diff helper for logging differences
 */
function computeDiff(legacy: any, canonical: any, path = ""): string[] {
  const diffs: string[] = [];

  if (typeof legacy !== typeof canonical) {
    diffs.push(`${path}: type mismatch (${typeof legacy} vs ${typeof canonical})`);
    return diffs;
  }

  if (legacy === null || canonical === null || typeof legacy !== "object") {
    if (legacy !== canonical) {
      diffs.push(`${path}: ${JSON.stringify(legacy)} !== ${JSON.stringify(canonical)}`);
    }
    return diffs;
  }

  if (Array.isArray(legacy) && Array.isArray(canonical)) {
    if (legacy.length !== canonical.length) {
      diffs.push(`${path}: array length mismatch (${legacy.length} vs ${canonical.length})`);
    }
    const maxLen = Math.max(legacy.length, canonical.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= legacy.length) {
        diffs.push(`${path}[${i}]: missing in legacy`);
      } else if (i >= canonical.length) {
        diffs.push(`${path}[${i}]: missing in canonical`);
      } else {
        diffs.push(...computeDiff(legacy[i], canonical[i], `${path}[${i}]`));
      }
    }
    return diffs;
  }

  const allKeys = new Set([...Object.keys(legacy), ...Object.keys(canonical)]);
  for (const key of allKeys) {
    const newPath = path ? `${path}.${key}` : key;
    if (!(key in legacy)) {
      diffs.push(`${newPath}: missing in legacy`);
    } else if (!(key in canonical)) {
      diffs.push(`${newPath}: missing in canonical`);
    } else {
      diffs.push(...computeDiff(legacy[key], canonical[key], newPath));
    }
  }

  return diffs;
}

describe("Legacy vs Canonical Parity", () => {
  describe("Informational snapshot comparison (non-strict)", () => {
    it("captures both outputs for comparison without requiring equality", async () => {
      // Run legacy path (full bundles)
      const legacyFullFrame = await runInterpreter({ date: TEST_DATE });
      
      // Run canonical path (returns InterpretiveFrame with full bundles via transformer)
      const canonicalFrame = await runCanonicalMeaningToFrameForTest(TEST_DATE);
      
      // Also get canonical raw DailyInterpretation (with refs) for snapshot
      const inputs = await loadInterpretationInputs(TEST_DATE, { semantics: "require" });
      const canonicalRawDaily = await deriveDailyInterpretation(inputs);

      // Validate both are valid InterpretiveFrames
      expect(() => InterpretiveFrameSchema.parse(legacyFullFrame)).not.toThrow();
      expect(() => InterpretiveFrameSchema.parse(canonicalFrame)).not.toThrow();

      // Snapshot legacy full frame
      expect(legacyFullFrame).toMatchSnapshot("legacy-full-frame");
      
      // Snapshot canonical raw refs (DailyInterpretation with refs)
      expect(canonicalRawDaily).toMatchSnapshot("canonical-raw-refs-daily");
      
      // Snapshot canonical hydrated frame (InterpretiveFrame with full bundles)
      expect(canonicalFrame).toMatchSnapshot("canonical-hydrated-frame");

      // Compute and snapshot diff (informational only)
      const diffs = computeDiff(legacyFullFrame, canonicalFrame);
      if (diffs.length > 0) {
        // Log diffs for visibility (but don't fail the test)
        console.log(`[INFO] Legacy vs Canonical differences (${diffs.length} total):`);
        diffs.slice(0, 20).forEach((diff) => console.log(`  ${diff}`));
        if (diffs.length > 20) {
          console.log(`  ... and ${diffs.length - 20} more differences`);
        }
        
        // Snapshot the diff summary
        expect({
          total_differences: diffs.length,
          sample_differences: diffs.slice(0, 50),
        }).toMatchSnapshot("legacy-vs-canonical-diff-summary");
      } else {
        // If no diffs, that's great - but we still pass
        expect(diffs).toHaveLength(0);
      }

      // Test passes regardless of differences (informational only)
      expect(true).toBe(true);
    });

    it("proves determinism for both paths independently", async () => {
      // Legacy determinism
      const legacy1 = await runInterpreter({ date: TEST_DATE });
      const legacy2 = await runInterpreter({ date: TEST_DATE });
      expect(legacy1).toEqual(legacy2);

      // Canonical determinism
      const canonical1 = await runCanonicalMeaningToFrameForTest(TEST_DATE);
      const canonical2 = await runCanonicalMeaningToFrameForTest(TEST_DATE);
      expect(canonical1).toEqual(canonical2);
    });
  });

  describe("Strict equivalence gate (gated until parity)", () => {
    /**
     * This test runs when CLOUDIA_STRICT_PARITY=1 is set.
     * 
     * To enable:
     * CLOUDIA_STRICT_PARITY=1 node -r dotenv/config ./node_modules/.bin/vitest run ...
     * 
     * Once this passes, it becomes the "safe to switch production" gate.
     */
    const STRICT = process.env.CLOUDIA_STRICT_PARITY === "1";
    const maybeIt = STRICT ? it : it.skip;

    maybeIt("legacy vs canonical strict equivalence (parity gate)", async () => {
      // Run legacy path (full bundles)
      const legacyFullFrame = await runInterpreter({ date: TEST_DATE });

      // Run canonical path and hydrate for comparison
      // Get canonical DailyInterpretation (with refs)
      const inputs = await loadInterpretationInputs(TEST_DATE, { semantics: "require" });
      const canonicalDaily = await deriveDailyInterpretation(inputs);
      
      // Build bundle index for hydration
      const bundleIndex = buildBundleIndex();
      
      // Hydrate canonical DailyInterpretation refs to full bundles
      const canonicalHydrated = hydrateDailyInterpretationBundles(canonicalDaily, bundleIndex);
      
      // Transform to InterpretiveFrame for comparison (already has full bundles from transformer)
      const canonicalFrame = await runCanonicalMeaningToFrameForTest(TEST_DATE);
      
      // For strict parity, compare legacy full frame vs canonical hydrated frame
      // The canonical frame already has full bundles (via transformer), so we can compare directly
      // But we also verify the DailyInterpretation hydration works correctly
      expect(canonicalFrame.interpretation_bundles.primary).toHaveLength(
        legacyFullFrame.interpretation_bundles.primary.length
      );
      expect(canonicalFrame.interpretation_bundles.secondary).toHaveLength(
        legacyFullFrame.interpretation_bundles.secondary.length
      );
      
      // Strict deep equality check: legacy full frame vs canonical hydrated frame
      // This will fail until parity is achieved
      expect(canonicalFrame).toEqual(legacyFullFrame);
    });
  });
});

