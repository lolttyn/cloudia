import { describe, expect, it } from "vitest";
import { buildIntroScaffold } from "../introScaffold.js";
import { buildClosingScaffold } from "../closingScaffold.js";
import { buildSegmentPrompt } from "../buildSegmentPrompt.js";
import { getWritingContract } from "../../editorial/contracts/segmentWritingContracts.js";
import { EpisodeEditorialPlan } from "../../editorial/planner/types.js";
import { SegmentPromptInput } from "../../editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "../../editorial/validation/episodeValidationResult.js";

const BANNED_PHRASE = "meaning over minutiae";

describe("meaning over minutiae regression test", () => {
  it("should not include banned phrase in intro scaffold", () => {
    const scaffold = buildIntroScaffold({
      episode_date: "2026-01-14",
      axis_primary: "meaning",
      axis_counter: "minutiae",
      why_today_clause: "Today is a brief window to notice what matters.",
    });

    expect(scaffold.toLowerCase()).not.toContain(BANNED_PHRASE.toLowerCase());
    expect(scaffold.toLowerCase()).not.toContain("meaning over minutiae");
    // Should not contain the statement format even with different casing
    expect(scaffold.toLowerCase().replace(/\s+/g, " ")).not.toContain("meaning over minutiae");
  });

  it("should not include banned phrase in closing scaffold", () => {
    const { scaffold } = buildClosingScaffold({
      episode_date: "2026-01-14",
      axis_primary: "meaning",
      axis_counter: "minutiae",
      timing_note: "short integration window",
      temporal_phase: "building",
    });

    expect(scaffold.toLowerCase()).not.toContain(BANNED_PHRASE.toLowerCase());
    expect(scaffold.toLowerCase()).not.toContain("meaning over minutiae");
    // Should not contain the statement format even with different casing
    expect(scaffold.toLowerCase().replace(/\s+/g, " ")).not.toContain("meaning over minutiae");
  });

  it("should sanitize interpretive frame in intro prompt (remove statement, keep primary/counter)", () => {
    const interpretiveFrame = {
      date: "2026-01-14",
      dominant_contrast_axis: {
        statement: "meaning over minutiae", // The banned statement
        primary: "meaning",
        counter: "minutiae",
      },
      tone_descriptor: "wide and declarative",
      why_today: ["brief transit today"],
      supporting_themes: ["noticing what matters"],
      sky_anchors: [
        { type: "moon_sign", label: "Moon in Sagittarius", meaning: "direction and broad meaning" },
      ],
      causal_logic: ["Because the Moon in Sagittarius focuses on meaning."],
      why_today_clause: "Today is a brief Sagittarius Moon window to notice what matters.",
      temporal_phase: "building" as const,
      intensity_modifier: "emerging" as const,
      continuity: {},
      timing: { state: "building" as const },
      confidence_level: "high" as const,
      canon_compliance: { violations: [], notes: [] },
      interpretation_bundles: { primary: [], secondary: [], suppressed: [] },
      temporal_arc: {
        type: "none" as const,
        phase: "baseline",
        intensity: "emerging" as const,
        arc_day_index: 1,
        arc_total_days: 1,
      },
    };

    const segment: SegmentPromptInput = {
      episode_date: "2026-01-14",
      segment_key: "intro",
      intent: ["introduce_one_theme"],
      included_tags: ["theme:one"],
      suppressed_tags: [],
      confidence_level: "high",
      constraints: {
        max_ideas: 1,
        must_acknowledge_uncertainty: false,
        ban_repetition: true,
        interpretive_frame: interpretiveFrame,
      },
    };

    const episode_plan: EpisodeEditorialPlan = {
      episode_date: "2026-01-14",
      segments: [
        {
          segment_key: "intro",
          intent: ["introduce_one_theme"],
          included_tags: ["theme:one"],
          suppressed_tags: [],
          rationale: ["rule:intro"],
        },
      ],
      continuity_notes: {
        callbacks: [],
        avoided_repetition: [],
      },
      debug: {
        selected_by_segment: {
          intro: ["rule:intro"],
          main_themes: [],
          reflection: [],
          closing: [],
        },
        suppressed_by_rule: {},
      },
    };

    const writing_contract = getWritingContract("intro");
    const episode_validation: EpisodeValidationResult = {
      episode_date: "2026-01-14",
      is_valid: true,
      segment_results: [],
      lexical_fatigue: [],
      blocking_segments: [],
      warnings: [],
    };

    const prompt = buildSegmentPrompt({
      episode_plan,
      segment,
      writing_contract,
      episode_validation,
    });

    const userPromptLower = prompt.user_prompt.toLowerCase();
    const systemPromptLower = prompt.system_prompt.toLowerCase();

    // Should not contain "statement" field in JSON (it should be removed by sanitizer)
    expect(userPromptLower).not.toContain('"statement"');
    expect(userPromptLower).not.toContain('"statement":');

    // Should contain primary/counter pattern in JSON instead
    expect(userPromptLower).toContain('"primary":');
    expect(userPromptLower).toContain('"counter":');
    expect(userPromptLower).toContain('"primary": "meaning"');
    expect(userPromptLower).toContain('"counter": "minutiae"');

    // Should contain primary/counter in instructions too
    expect(userPromptLower).toContain("meaning");
    expect(userPromptLower).toContain("minutiae");
    // But should use "vs" pattern in instructions, not "over"
    expect(userPromptLower).toMatch(/meaning.*vs.*minutiae|minutiae.*vs.*meaning/);

    // Should contain the ban instruction (prompt can mention the phrase as part of the instruction; that's fine)
    expect(userPromptLower).toContain('never use the phrase');

    // Note: The prompt may contain "meaning over minutiae" as part of the ban instruction.
    // That's acceptable - the real requirement is that generated SCRIPTS don't contain it.
    // The sanitizer prevents it from appearing in the JSON frame (checked above).
  });

  it("should sanitize interpretive frame in closing prompt (remove statement, keep primary/counter)", () => {
    const interpretiveFrame = {
      date: "2026-01-14",
      dominant_contrast_axis: {
        statement: "meaning over minutiae", // The banned statement
        primary: "meaning",
        counter: "minutiae",
      },
      tone_descriptor: "wide and declarative",
      why_today: ["brief transit today"],
      supporting_themes: ["noticing what matters"],
      sky_anchors: [
        { type: "moon_sign", label: "Moon in Sagittarius", meaning: "direction and broad meaning" },
      ],
      causal_logic: ["Because the Moon in Sagittarius focuses on meaning."],
      why_today_clause: "Today is a brief Sagittarius Moon window to notice what matters.",
      temporal_phase: "building" as const,
      intensity_modifier: "emerging" as const,
      continuity: {},
      timing: { state: "building" as const, notes: "short integration window" },
      confidence_level: "high" as const,
      canon_compliance: { violations: [], notes: [] },
      interpretation_bundles: { primary: [], secondary: [], suppressed: [] },
      temporal_arc: {
        type: "none" as const,
        phase: "baseline",
        intensity: "emerging" as const,
        arc_day_index: 1,
        arc_total_days: 1,
      },
    };

    const segment: SegmentPromptInput = {
      episode_date: "2026-01-14",
      segment_key: "closing",
      intent: ["close_the_day"],
      included_tags: ["theme:closure"],
      suppressed_tags: [],
      confidence_level: "high",
      constraints: {
        max_ideas: 1,
        must_acknowledge_uncertainty: false,
        ban_repetition: true,
        interpretive_frame: interpretiveFrame,
      },
    };

    const episode_plan: EpisodeEditorialPlan = {
      episode_date: "2026-01-14",
      segments: [
        {
          segment_key: "closing",
          intent: ["close_the_day"],
          included_tags: ["theme:closure"],
          suppressed_tags: [],
          rationale: ["rule:closing"],
        },
      ],
      continuity_notes: {
        callbacks: [],
        avoided_repetition: [],
      },
      debug: {
        selected_by_segment: {
          intro: [],
          main_themes: [],
          reflection: [],
          closing: ["rule:closing"],
        },
        suppressed_by_rule: {},
      },
    };

    const writing_contract = getWritingContract("closing");
    const episode_validation: EpisodeValidationResult = {
      episode_date: "2026-01-14",
      is_valid: true,
      segment_results: [],
      lexical_fatigue: [],
      blocking_segments: [],
      warnings: [],
    };

    const prompt = buildSegmentPrompt({
      episode_plan,
      segment,
      writing_contract,
      episode_validation,
    });

    const userPromptLower = prompt.user_prompt.toLowerCase();
    const systemPromptLower = prompt.system_prompt.toLowerCase();

    // Should not contain "statement" field in JSON (it should be removed by sanitizer)
    expect(userPromptLower).not.toContain('"statement"');
    expect(userPromptLower).not.toContain('"statement":');

    // Should contain primary/counter pattern in JSON instead
    expect(userPromptLower).toContain('"primary":');
    expect(userPromptLower).toContain('"counter":');
    expect(userPromptLower).toContain('"primary": "meaning"');
    expect(userPromptLower).toContain('"counter": "minutiae"');

    // Should contain the ban instruction (prompt can mention the phrase as part of the instruction; that's fine)
    expect(userPromptLower).toContain('never use the phrase');

    // Note: The prompt may contain "meaning over minutiae" as part of the ban instruction.
    // That's acceptable - the real requirement is that generated SCRIPTS don't contain it.
    // The sanitizer prevents it from appearing in the JSON frame (checked above).
  });
});
