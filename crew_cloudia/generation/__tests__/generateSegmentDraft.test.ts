import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateSegmentDraft } from "../generateSegmentDraft.js";
import { getWritingContract } from "../../editorial/contracts/segmentWritingContracts.js";
import { EpisodeEditorialPlan } from "../../editorial/planner/types.js";
import { SegmentPromptInput } from "../../editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "../../editorial/validation/episodeValidationResult.js";

const mockInvokeLLM = vi.hoisted(() => vi.fn());

vi.mock("../invokeLLM.js", () => ({
  __esModule: true,
  invokeLLM: (...args: any[]) => mockInvokeLLM(...args),
  CLOUDIA_LLM_CONFIG: {
    provider: "openai",
    model: "mock-model",
    temperature: 0.6,
    max_tokens: 800,
    frequency_penalty: 0.2,
    presence_penalty: 0.0,
    stop_sequences: null,
  },
}));

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
    interpretive_frame: {
      date: "2025-01-01",
      dominant_contrast_axis: {
        statement: "integration over momentum",
        primary: "integration",
        counter: "momentum",
      },
      tone_descriptor: "measured and discerning",
      why_today: ["brief transit today"],
      supporting_themes: ["noticing misalignments"],
      sky_anchors: [
        { type: "moon_sign", label: "Moon in Virgo", meaning: "refinement and calibration" },
        { type: "sun_sign", label: "Sun in Sagittarius", meaning: "direction and broad meaning" },
      ],
      causal_logic: ["Because the Moon in Virgo refines momentum."],
      why_today_clause: "Today is a brief Virgo Moon window to integrate before momentum returns.",
      timing: { state: "settling", notes: "short integration window" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    },
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

const passing_validation: EpisodeValidationResult = {
  episode_date: "2025-01-01",
  is_valid: true,
  segment_results: [],
  blocking_segments: [],
  warnings: [],
};

describe("generateSegmentDraft", () => {
  beforeEach(() => {
    mockInvokeLLM.mockReset();
  });

  it("throws when segment is globally blocked", async () => {
    const writing_contract = getWritingContract("intro");

    await expect(
      generateSegmentDraft({
        episode_plan,
        segment,
        writing_contract,
        episode_validation: blocked_validation,
      })
    ).rejects.toThrow(/globally blocked/);
  });

  it("surfaces forbidden phrase violations from generated draft", async () => {
    const writing_contract = getWritingContract("intro");
    const generatedText =
      "orientation context_framing deep interpretation " +
      "filler ".repeat(90);

    mockInvokeLLM.mockResolvedValueOnce({
      status: "ok",
      text: generatedText,
      model: "mock-model",
    });

    const result = await generateSegmentDraft({
      episode_plan,
      segment,
      writing_contract,
      episode_validation: passing_validation,
    });

    expect(result.draft_script).toContain("deep interpretation");
    expect(result.metadata.model_id).toBe("mock-model");
    expect(result.self_check.contract_violations).toContain(
      "forbidden_phrase:deep interpretation"
    );
  });
});

