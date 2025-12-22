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
    {
      segment_key: "main_themes",
      intent: ["headline_primary"],
      included_tags: ["theme:primary"],
      suppressed_tags: [],
      rationale: ["rule:main"],
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      continuity: { references_yesterday: "Yesterday signaled integration; today it is emerging." },
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
  lexical_fatigue: [],
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
  lexical_fatigue: [],
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

  it("accepts main_themes beat-style output without old headings and with contractions", async () => {
    const writing_contract = getWritingContract("main_themes");
    const segmentMain: SegmentPromptInput = {
      ...segment,
      segment_key: "main_themes",
      intent: ["headline_primary"],
      included_tags: ["theme:primary"],
      suppressed_tags: [],
      confidence_level: "medium",
      constraints: {
        ...segment.constraints,
        interpretive_frame: {
          ...segment.constraints.interpretive_frame,
          dominant_contrast_axis: {
            statement: "honesty over smoothing things over",
            primary: "honesty",
            counter: "smooth_over",
          },
          why_today_clause: "Because the Moon and Sun are in a tight team-up today.",
          sky_anchors: [{ type: "moon_sign", label: "Moon in Sagittarius", meaning: "candor" }],
          interpretation_bundles: { primary: [], secondary: [] },
        },
      },
    };

    const casualDraft =
      "What today’s really about: saying what you actually feel instead of sanding off the edges. " +
      "Why this is showing up now: the Moon in Sagittarius is teaming with the Sun, so candor is front and center. " +
      "How this might show up in real life: you might blurt the truth in a meeting or text a friend what you actually mean. " +
      "How seriously to take this: I feel pretty solid about this vibe—treat it like weather, not destiny.";

    mockInvokeLLM.mockResolvedValueOnce({
      status: "ok",
      text: casualDraft,
      model: "mock-model",
    });

    const result = await generateSegmentDraft({
      episode_plan,
      segment: segmentMain,
      writing_contract,
      episode_validation: passing_validation,
    });

    expect(result.draft_script).not.toMatch(/Primary Meanings|Relevance|Confidence Alignment/i);
    expect(result.draft_script).not.toMatch(/interpretation aligns with/i);
    expect(result.draft_script).toMatch(/doesn’t|don't|you'll|you might/i);
    expect(result.self_check.contract_violations).not.toContain(
      expect.stringContaining("missing_required_section")
    );
  });

  it("enforces conversational flow and rejects rubric/list artifacts", async () => {
    const writing_contract = getWritingContract("main_themes");
    const segmentMain: SegmentPromptInput = {
      ...segment,
      segment_key: "main_themes",
      intent: ["headline_primary"],
      included_tags: ["theme:primary"],
      suppressed_tags: [],
      confidence_level: "medium",
      constraints: {
        ...segment.constraints,
        interpretive_frame: {
          ...segment.constraints.interpretive_frame,
          dominant_contrast_axis: {
            statement: "candor over smoothing things over",
            primary: "candor",
            counter: "smooth_over",
          },
          why_today_clause: "Because the Moon in Sagittarius teams with the Sun today.",
          sky_anchors: [{ type: "moon_sign", label: "Moon in Sagittarius", meaning: "candor" }],
          interpretation_bundles: { primary: [], secondary: [] },
        },
      },
    };

    const flowingDraft =
      "Hey, it’s me—today is really about candor over smoothing things over, because the Moon in Sagittarius is teaming with the Sun. You might notice yourself saying what you actually feel; it’s more like weather than destiny, so take it lightly.";

    mockInvokeLLM.mockResolvedValueOnce({
      status: "ok",
      text: flowingDraft,
      model: "mock-model",
    });

    const result = await generateSegmentDraft({
      episode_plan,
      segment: segmentMain,
      writing_contract,
      episode_validation: passing_validation,
    });

    const script = result.draft_script;

    expect(script).not.toMatch(/Primary Meanings|Relevance|Confidence Alignment/i);
    expect(script).not.toMatch(/interpretation aligns with|based on the data|confidence level/i);
    expect(script).not.toMatch(/^\s*#|^\s*##/m); // headings
    expect(script).not.toMatch(/^\s*\d+\./m); // numbered lists
    expect(script).not.toMatch(/^\s*[-•]\s/m); // bullets
    expect(script).toMatch(/(it’s|it's|don't|you might|you’ll|you'll)/i);
  });
});
