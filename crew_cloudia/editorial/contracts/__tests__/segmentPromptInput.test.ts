import { describe, expect, it } from "vitest";
import { mapEditorialPlanToSegmentInputs } from "../mapEditorialPlanToSegmentInputs.js";
import { planEpisodeEditorial } from "../../planner/planEpisodeEditorial.js";
import {
  interpretation_high_confidence_basic,
  interpretation_low_confidence_with_repeats,
  memory_with_recent_theme_repetition,
} from "../../planner/__tests__/fixtures.js";
import { ConfidenceLevel, EpisodeEditorialPlan } from "../../planner/types.js";

const withConfidence = (
  plan: EpisodeEditorialPlan,
  confidence: ConfidenceLevel
): EpisodeEditorialPlan & { confidence_level: ConfidenceLevel } => ({
  ...plan,
  confidence_level: confidence,
});

describe("mapEditorialPlanToSegmentInputs", () => {
  const SEGMENT_ORDER = ["intro", "main_themes", "reflection", "closing"];

  it("maps exactly one prompt input per canonical segment in order", () => {
    const plan = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const inputs = mapEditorialPlanToSegmentInputs(plan);

    expect(inputs).toHaveLength(SEGMENT_ORDER.length);
    expect(inputs.map((i) => i.segment_key)).toStrictEqual(SEGMENT_ORDER);
  });

  it("throws when a required segment is missing", () => {
    const fullPlan = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const missing = {
      ...fullPlan,
      segments: fullPlan.segments.filter((s) => s.segment_key !== "main_themes"),
    };

    expect(() => mapEditorialPlanToSegmentInputs(missing)).toThrow();
  });

  it("throws when a segment has an empty intent array", () => {
    const fullPlan = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const invalid = {
      ...fullPlan,
      segments: fullPlan.segments.map((segment) =>
        segment.segment_key === "intro" ? { ...segment, intent: [] } : segment
      ),
    };

    expect(() => mapEditorialPlanToSegmentInputs(invalid)).toThrow(
      /empty intent/i
    );
  });

  it("aligns constraints and enforces max_ideas >= 1", () => {
    const planHigh = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const inputs = mapEditorialPlanToSegmentInputs(planHigh);
    const byKey = Object.fromEntries(inputs.map((input) => [input.segment_key, input]));

    expect(byKey.intro.constraints).toMatchObject({
      max_ideas: 1,
      ban_repetition: true,
      must_acknowledge_uncertainty: false,
    });
    expect(byKey.main_themes.constraints).toMatchObject({
      max_ideas: 3,
      ban_repetition: true,
      must_acknowledge_uncertainty: false,
    });
    expect(byKey.reflection.constraints).toMatchObject({
      max_ideas: 2,
      ban_repetition: false,
      must_acknowledge_uncertainty: false,
    });
    expect(byKey.closing.constraints).toMatchObject({
      max_ideas: 1,
      ban_repetition: true,
      must_acknowledge_uncertainty: false,
    });

    inputs.forEach((input) => {
      expect(input.constraints.max_ideas).toBeGreaterThanOrEqual(1);
    });
  });

  it("propagates confidence and uncertainty requirements for low confidence plans", () => {
    const planLow = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_low_confidence_with_repeats,
        memory: memory_with_recent_theme_repetition,
      }),
      "low"
    );

    const inputs = mapEditorialPlanToSegmentInputs(planLow);
    inputs.forEach((input) => {
      expect(input.confidence_level).toBe("low");
    });

    const mainThemes = inputs.find((i) => i.segment_key === "main_themes");
    const reflection = inputs.find((i) => i.segment_key === "reflection");

    expect(mainThemes?.constraints.must_acknowledge_uncertainty).toBe(true);
    expect(reflection?.constraints.must_acknowledge_uncertainty).toBe(true);
  });

  it("is deterministic for identical plans", () => {
    const plan = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const first = mapEditorialPlanToSegmentInputs(plan);
    const second = mapEditorialPlanToSegmentInputs(plan);

    expect(first).toStrictEqual(second);
  });

  it("stabilizes output order even if plan segments are unordered", () => {
    const plan = withConfidence(
      planEpisodeEditorial({
        interpretation: interpretation_high_confidence_basic,
        memory: { recent_tags: [] },
      }),
      "high"
    );

    const shuffled = { ...plan, segments: [...plan.segments].reverse() };
    const inputs = mapEditorialPlanToSegmentInputs(shuffled);

    expect(inputs.map((i) => i.segment_key)).toStrictEqual(SEGMENT_ORDER);
  });
});


