/**
 * Phase E1 — Canonical Runner Tests
 * 
 * Test 1: Frame contract parity (hard)
 * Test 2: Determinism (hard)
 * Test 3: Persistence sanity (required)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runInterpreter } from "../../../interpretation/runInterpreter.js";
import { runInterpreterCanonical } from "../runInterpreterCanonical.js";
import { InterpretiveFrameSchema } from "../../../interpretation/schema/InterpretiveFrame.js";
import * as upsertDailyInterpretationModule from "../persistence/upsertDailyInterpretation.js";
import * as loadInterpretationInputsModule from "../loadInterpretationInputs.js";
import type { InterpretationInputs } from "../loadInterpretationInputs.js";
import type { SkyState } from "../../../../astro/schemas/skyState.schema.js";
import type { DailyFacts } from "../../technician/schema/dailyFacts.schema.js";

const TEST_DATE = "2024-01-15";

/**
 * Strip volatile fields from frame for deterministic comparison
 */
function stripVolatile(frame: any): any {
  const stripped = { ...frame };
  // Remove any volatile fields that might differ between runs
  delete (stripped as any).generated_at;
  delete (stripped as any).updated_at;
  delete (stripped as any).created_at;
  // Remove any metadata that might be non-deterministic
  if (stripped.canon_compliance) {
    const compliance = { ...stripped.canon_compliance };
    delete (compliance as any).generated_at;
    delete (compliance as any).updated_at;
    stripped.canon_compliance = compliance;
  }
  return stripped;
}

/**
 * Get stable top-level keys for comparison
 */
function getStableKeys(frame: any): string[] {
  const requiredKeys = [
    "date",
    "dominant_contrast_axis",
    "tone_descriptor",
    "why_today",
    "supporting_themes",
    "sky_anchors",
    "causal_logic",
    "why_today_clause",
    "temporal_phase",
    "intensity_modifier",
    "continuity",
    "temporal_arc",
    "timing",
    "signals",
    "interpretation_bundles",
    "confidence_level",
    "canon_compliance",
  ];
  return requiredKeys.filter((key) => key in frame);
}

describe("runInterpreterCanonical", () => {
  // Mock upsertDailyInterpretation to avoid DB dependency in tests
  const mockUpsert = vi.fn();
  const mockLoadInputs = vi.fn();
  
  // Create minimal mock data for InterpretationInputs
  const createMockInputs = (date: string): InterpretationInputs => {
    const mockSkyState: SkyState = {
      schema_version: "1.0.0",
      meta: {
        engine: "swisseph",
        engine_version: "test",
        ephemeris_fileset: "test",
        coordinate_system: "tropical",
        timestamp_generated: `${date}T12:00:00.000Z`,
      },
      timestamp: {
        date,
        utc_datetime: `${date}T12:00:00.000Z`,
        timezone: "UTC",
        julian_day: 2460312.0,
      },
      bodies: {
        sun: {
          longitude: 281.5,
          speed_deg_per_day: 1.0,
          retrograde: false,
          sign: "capricorn",
          sign_degree: 11.5,
        },
        moon: {
          longitude: 45.2,
          speed_deg_per_day: 13.2,
          retrograde: false,
          sign: "aquarius",
          sign_degree: 15.2,
        },
      },
      aspects: [],
      lunar: {
        phase_name: "waxing",
        phase_angle_deg: 45,
        illumination_pct: 25,
      },
    };

    const mockDailyFacts: DailyFacts = {
      schema_version: "1.0.0",
      technician_policy_version: "v1",
      date,
      timestamp_generated: `${date}T12:00:00.000Z`,
      source: {
        sky_state_schema_version: "1.0.0",
        engine: "swisseph",
        engine_version: "test",
        ephemeris_fileset: "test",
      },
      transits: [],
    };

    return {
      timestamp: {
        date,
        timezone: "UTC",
        canonical_utc_datetime: `${date}T12:00:00.000Z`,
      },
      sky_state: mockSkyState,
      daily_facts: mockDailyFacts,
      meta: {
        sky_state_version: "1.0.0",
        daily_facts_policy_version: "v1",
      },
    };
  };
  
  beforeEach(() => {
    mockUpsert.mockClear();
    vi.spyOn(upsertDailyInterpretationModule, "upsertDailyInterpretation").mockImplementation(mockUpsert);
    vi.spyOn(loadInterpretationInputsModule, "loadInterpretationInputs").mockImplementation(async (date) => {
      return createMockInputs(date);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Test 1: Frame contract parity", () => {
    it("should produce valid InterpretiveFrame matching legacy shape", async () => {
      const legacy = await runInterpreter({ date: TEST_DATE });
      const canon = await runInterpreterCanonical({ date: TEST_DATE });

      // Both should parse against InterpretiveFrameSchema
      const legacyValidated = InterpretiveFrameSchema.parse(legacy);
      const canonValidated = InterpretiveFrameSchema.parse(canon);

      expect(legacyValidated).toBeDefined();
      expect(canonValidated).toBeDefined();

      // Assert required top-level keys match
      const legacyKeys = getStableKeys(legacy);
      const canonKeys = getStableKeys(canon);

      // Both should have the same required keys
      expect(canonKeys.sort()).toEqual(legacyKeys.sort());

      // Both should have date
      expect(canon.date).toBe(TEST_DATE);
      expect(legacy.date).toBe(TEST_DATE);

      // Both should have dominant_contrast_axis
      expect(canon.dominant_contrast_axis).toBeDefined();
      expect(legacy.dominant_contrast_axis).toBeDefined();
      expect(canon.dominant_contrast_axis.statement).toBeDefined();
      expect(canon.dominant_contrast_axis.primary).toBeDefined();
      expect(canon.dominant_contrast_axis.counter).toBeDefined();

      // Both should have interpretation_bundles
      expect(canon.interpretation_bundles).toBeDefined();
      expect(legacy.interpretation_bundles).toBeDefined();
      expect(canon.interpretation_bundles.primary).toBeDefined();
      expect(canon.interpretation_bundles.secondary).toBeDefined();
    }, 30000);
  });

  describe("Test 2: Determinism", () => {
    it("should produce identical results on multiple calls (after normalizing volatile fields)", async () => {
      const result1 = await runInterpreterCanonical({ date: TEST_DATE });
      const result2 = await runInterpreterCanonical({ date: TEST_DATE });

      // Strip volatile fields
      const stripped1 = stripVolatile(result1);
      const stripped2 = stripVolatile(result2);

      // Deep equality check
      expect(stripped1).toEqual(stripped2);

      // Also verify schema compliance
      expect(InterpretiveFrameSchema.parse(result1)).toBeDefined();
      expect(InterpretiveFrameSchema.parse(result2)).toBeDefined();
    }, 30000);
  });

  describe("Test 3: Persistence sanity", () => {
    it("should persist DailyInterpretation to database", async () => {
      // Run canonical interpreter
      await runInterpreterCanonical({ date: TEST_DATE });

      // Verify upsertDailyInterpretation was called
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      
      // Verify the call arguments
      const callArgs = mockUpsert.mock.calls[0][0];
      expect(callArgs.episode_date).toBe(TEST_DATE);
      expect(callArgs.dailyInterpretation).toBeDefined();
      
      // Verify the persisted interpretation has required fields
      const interpretation = callArgs.dailyInterpretation;
      expect(interpretation.date).toBe(TEST_DATE);
      expect(interpretation.dominant_contrast_axis).toBeDefined();
      expect(interpretation.signals).toBeDefined();
      expect(interpretation.interpretation_bundles).toBeDefined();
      expect(interpretation.schema_version).toBeDefined();
    }, 30000);
  });
});

