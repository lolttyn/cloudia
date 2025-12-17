import { describe, expect, it } from "vitest";
import { generateSegmentDraft } from "../generateSegmentDraft.js";
import { getWritingContract } from "../../editorial/contracts/segmentWritingContracts.js";
import { EpisodeEditorialPlan } from "../../editorial/planner/types.js";
import { SegmentPromptInput } from "../../editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "../../editorial/validation/episodeValidationResult.js";

const episode_plan: EpisodeEditorialPlan = {
  episode_date: "2025-01-01",
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

const segment: SegmentPromptInput = {
  episode_date: "2025-01-01",
  segment_key: "intro",
  intent: ["introduce_one_theme"],
  included_tags: ["theme:one"],
  suppressed_tags: [],
  confidence_level: "high",
  constraints: {
    max_ideas: 1,
    must_acknowledge_uncertainty: false,
    ban_repetition: true,
  },
};

const blocked_validation: EpisodeValidationResult = {
  episode_date: "2025-01-01",
  is_valid: false,
  segment_results: [],
  blocking_segments: [
    {
      segment_key: "intro",
      reasons: ["blocked upstream"],
    },
  ],
  warnings: [],
};

describe("generateSegmentDraft", () => {
  it("throws when segment is globally blocked", () => {
    const writing_contract = getWritingContract("intro");

    expect(() =>
      generateSegmentDraft({
        episode_plan,
        segment,
        writing_contract,
        episode_validation: blocked_validation,
      })
    ).toThrow(/globally blocked/);
  });
});

