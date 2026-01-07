/**
 * Production contract test for transformToInterpretiveFrame
 * 
 * Ensures the frame view builder is production-safe:
 * - Validates output against InterpretiveFrameSchema
 * - Verifies determinism (same input → same output)
 * - Confirms no test-only dependencies
 */

import { describe, it, expect } from "vitest";
import { transformToInterpretiveFrame } from "../transformToInterpretiveFrame.js";
import { InterpretiveFrameSchema } from "../../../interpretation/schema/InterpretiveFrame.js";
import { DailyInterpretationSchema } from "../schema/dailyInterpretation.schema.js";
import { loadInterpretationInputs } from "../loadInterpretationInputs.js";
import { deriveDailyInterpretation } from "../deriveDailyInterpretation.js";

const TEST_DATE = "2024-01-15";

describe("transformToInterpretiveFrame production contract", () => {
  it("produces valid InterpretiveFrame from DailyInterpretation", async () => {
    // Load canonical inputs and derive DailyInterpretation (refs-only)
    const inputs = await loadInterpretationInputs(TEST_DATE, { semantics: "require" });
    const dailyInterpretation = await deriveDailyInterpretation(inputs);
    
    // Validate input is refs-only
    expect(dailyInterpretation.interpretation_bundles.primary[0]).toHaveProperty("bundle_slug");
    expect(dailyInterpretation.interpretation_bundles.primary[0]).toHaveProperty("salience_class");
    expect(dailyInterpretation.interpretation_bundles.primary[0]).not.toHaveProperty("meaning");
    
    // Transform to InterpretiveFrame
    const frame = transformToInterpretiveFrame(dailyInterpretation);
    
    // Validate output matches InterpretiveFrameSchema
    expect(() => InterpretiveFrameSchema.parse(frame)).not.toThrow();
    
    // Validate bundles are hydrated (full bundles, not refs)
    expect(frame.interpretation_bundles.primary.length).toBeGreaterThan(0);
    expect(frame.interpretation_bundles.primary[0]).toHaveProperty("slug");
    expect(frame.interpretation_bundles.primary[0]).toHaveProperty("meaning");
    expect(frame.interpretation_bundles.primary[0]).not.toHaveProperty("salience_class");
  });

  it("is deterministic (same input produces same output)", async () => {
    const inputs = await loadInterpretationInputs(TEST_DATE, { semantics: "require" });
    const dailyInterpretation = await deriveDailyInterpretation(inputs);
    
    const frame1 = transformToInterpretiveFrame(dailyInterpretation);
    const frame2 = transformToInterpretiveFrame(dailyInterpretation);
    
    expect(frame1).toEqual(frame2);
  });

  it("preserves all required InterpretiveFrame fields", async () => {
    const inputs = await loadInterpretationInputs(TEST_DATE, { semantics: "require" });
    const dailyInterpretation = await deriveDailyInterpretation(inputs);
    const frame = transformToInterpretiveFrame(dailyInterpretation);
    
    // Check all required fields are present
    expect(frame).toHaveProperty("date");
    expect(frame).toHaveProperty("dominant_contrast_axis");
    expect(frame).toHaveProperty("tone_descriptor");
    expect(frame).toHaveProperty("why_today");
    expect(frame).toHaveProperty("why_today_clause");
    expect(frame).toHaveProperty("supporting_themes");
    expect(frame).toHaveProperty("sky_anchors");
    expect(frame).toHaveProperty("causal_logic");
    expect(frame).toHaveProperty("temporal_phase");
    expect(frame).toHaveProperty("intensity_modifier");
    expect(frame).toHaveProperty("continuity");
    expect(frame).toHaveProperty("temporal_arc");
    expect(frame).toHaveProperty("timing");
    expect(frame).toHaveProperty("signals");
    expect(frame).toHaveProperty("interpretation_bundles");
    expect(frame).toHaveProperty("confidence_level");
    expect(frame).toHaveProperty("canon_compliance");
  });
});

