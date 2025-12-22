import { describe, expect, it } from "vitest";
import { planEpisodeEditorial } from "../planEpisodeEditorial.js";
import { EpisodeEditorialPlanSchema } from "../schema.js";
import {
  ED_RULE_BACKGROUND_NEVER_HEADLINES,
  ED_RULE_INTRO_MAX_NEW_IDEAS_1,
  ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY,
  ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK,
  ED_RULE_SPEAKABILITY_AVOID_NEVER,
} from "../rules.js";
import {
  interpretation_high_confidence_basic,
  interpretation_low_confidence_with_repeats,
  interpretation_lunation_special,
  memory_with_recent_theme_repetition,
} from "./fixtures.js";

describe("planEpisodeEditorial", () => {
  it("emits fixed ordered segments", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    expect(plan.segments.map((s) => s.segment_key)).toStrictEqual([
      "intro",
      "main_themes",
      "reflection",
      "closing",
    ]);
  });

  it("limits intro to one idea and records rationale", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    const intro = plan.segments.find((s) => s.segment_key === "intro");
    expect(intro).toBeDefined();
    expect(intro?.included_tags.length).toBeLessThanOrEqual(1);
    expect(intro?.rationale).toContain(ED_RULE_INTRO_MAX_NEW_IDEAS_1);
  });

  it("never includes avoid and traces suppression", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    const flattened = plan.segments.flatMap((s) => s.included_tags);
    expect(flattened).not.toContain("avoid-delta");
    expect(
      plan.debug.suppressed_by_rule[ED_RULE_SPEAKABILITY_AVOID_NEVER]
    ).toContain("avoid-delta");
  });

  it("keeps background from headlining when primary exists", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    const main = plan.segments.find((s) => s.segment_key === "main_themes");
    expect(main).toBeDefined();
    expect(main?.included_tags[0]).not.toBe("background-gamma");
    expect(
      plan.debug.suppressed_by_rule[ED_RULE_BACKGROUND_NEVER_HEADLINES] ?? []
    ).not.toContain("core-theme-alpha");
  });

  it("suppresses repeated can_say tags and logs continuity", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_low_confidence_with_repeats,
      memory: memory_with_recent_theme_repetition,
    });

    expect(plan.continuity_notes.avoided_repetition).toContain("repeat-can");
    expect(
      plan.debug.suppressed_by_rule[ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK]
    ).toContain("repeat-can");
    const flattened = plan.segments.flatMap((s) => s.included_tags);
    expect(flattened).not.toContain("repeat-can");
  });

  it("allows repeated must_say as callback", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_low_confidence_with_repeats,
      memory: memory_with_recent_theme_repetition,
    });

    expect(plan.continuity_notes.callbacks).toContain("repeat-must");
    const flattened = plan.segments.flatMap((s) => s.included_tags);
    expect(flattened).toContain("repeat-must");
  });

  it("adds uncertainty intent for low confidence reflection", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_low_confidence_with_repeats,
      memory: memory_with_recent_theme_repetition,
    });

    const reflection = plan.segments.find((s) => s.segment_key === "reflection");
    expect(reflection?.intent).toContain("reflect_on_uncertainty");
    expect(reflection?.rationale).toContain(
      ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY
    );
  });

  it("passes schema validation", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    expect(() => EpisodeEditorialPlanSchema.parse(plan)).not.toThrow();
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    };

    const plan1 = planEpisodeEditorial(input);
    const plan2 = planEpisodeEditorial(input);

    expect(plan1).toStrictEqual(plan2);
  });

  it("is stable regardless of interpretation tag order", () => {
    const shuffled = {
      ...interpretation_high_confidence_basic,
      tags: [...interpretation_high_confidence_basic.tags].reverse(),
    };

    const plan1 = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    const plan2 = planEpisodeEditorial({
      interpretation: shuffled,
      memory: { recent_tags: [] },
    });

    expect(plan1).toStrictEqual(plan2);
  });

  it("collapses around lunation days with the lunation tag headlining", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_lunation_special,
      memory: { recent_tags: [] },
    });

    const intro = plan.segments.find((s) => s.segment_key === "intro");
    const main = plan.segments.find((s) => s.segment_key === "main_themes");
    const reflection = plan.segments.find((s) => s.segment_key === "reflection");
    const closing = plan.segments.find((s) => s.segment_key === "closing");

    expect(intro?.included_tags).toContain("new_moon_in_sagittarius");
    expect(main?.included_tags).toContain("new_moon_in_sagittarius");
    expect(reflection?.included_tags.length).toBeLessThanOrEqual(1);
    expect(closing?.included_tags.length).toBeLessThanOrEqual(1);
    expect(plan.segments.flatMap((s) => s.included_tags)).toContain(
      "new_moon_in_sagittarius"
    );
  });

  it("allows lunation days to include other themes alongside the phase tag", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_lunation_special,
      memory: { recent_tags: [] },
    });

    expect(plan.segments.map((s) => s.intent)).toEqual([
      ["introduce_one_theme"],
      ["headline_primary"],
      ["integrate_and_reflect"],
      ["close_with_action"],
    ]);

    const allTags = plan.segments.flatMap((s) => s.included_tags);
    expect(allTags).toContain("new_moon_in_sagittarius");
    expect(new Set(allTags).size).toBeGreaterThan(1);
  });

  it("keeps non-lunation planning unchanged on non-lunation days", () => {
    const plan = planEpisodeEditorial({
      interpretation: interpretation_high_confidence_basic,
      memory: { recent_tags: [] },
    });

    const main = plan.segments.find((s) => s.segment_key === "main_themes");
    expect(main?.included_tags.length).toBeGreaterThanOrEqual(1);
    expect(plan.segments.map((s) => s.intent)).toEqual([
      ["introduce_one_theme"],
      ["headline_primary"],
      ["integrate_and_reflect"],
      ["close_with_action"],
    ]);
  });
});
