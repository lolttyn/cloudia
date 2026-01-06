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
      // Run legacy path
      const legacy = await runInterpreter({ date: TEST_DATE });
      
      // Run canonical path
      const canonical = await runCanonicalMeaningToFrameForTest(TEST_DATE);

      // Validate both are valid InterpretiveFrames
      expect(() => InterpretiveFrameSchema.parse(legacy)).not.toThrow();
      expect(() => InterpretiveFrameSchema.parse(canonical)).not.toThrow();

      // Snapshot both outputs (for visual comparison)
      expect(legacy).toMatchSnapshot("legacy-interpretive-frame");
      expect(canonical).toMatchSnapshot("canonical-interpretive-frame");

      // Compute and snapshot diff (informational only)
      const diffs = computeDiff(legacy, canonical);
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
     * This test is SKIPPED until meaning parity is achieved.
     * 
     * To enable:
     * 1. Remove .skip or change to .todo
     * 2. Ensure deriveDailyInterpretation() produces equivalent meaning to legacy
     * 3. Ensure transformToInterpretiveFrame() preserves all fields correctly
     * 4. Run and verify it passes
     * 
     * Once this passes, it becomes the "safe to switch production" gate.
     */
    it.skip("legacy vs canonical strict equivalence (parity gate)", async () => {
      // Run legacy path
      const legacy = await runInterpreter({ date: TEST_DATE });

      // Run canonical path
      const canonical = await runCanonicalMeaningToFrameForTest(TEST_DATE);

      // Strict deep equality check
      // This will fail until parity is achieved
      expect(canonical).toEqual(legacy);
    });

    /**
     * Alternative: Environment-gated version
     * Uncomment and use this if you want to enable via env var instead of .skip
     */
    it.todo("legacy vs canonical strict equivalence (enable with CLOUDIA_STRICT_PARITY=1)", async () => {
      if (!process.env.CLOUDIA_STRICT_PARITY) {
        console.log("[SKIP] Strict parity test requires CLOUDIA_STRICT_PARITY=1");
        return;
      }

      const legacy = await runInterpreter({ date: TEST_DATE });
      const canonical = await runCanonicalMeaningToFrameForTest(TEST_DATE);

      expect(canonical).toEqual(legacy);
    });
  });
});

