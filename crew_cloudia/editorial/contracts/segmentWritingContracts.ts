export type SegmentWritingContract = {
  segment_key: "intro" | "main_themes" | "reflection" | "closing";

  required_elements: string[];
  forbidden_elements: string[];

  structural_requirements: {
    min_paragraphs: number;
    max_paragraphs: number;
    requires_example: boolean;
    requires_callback: boolean;
  };

  tone_constraints: {
    allows_uncertainty: boolean;
    emotional_range: (
      | "grounded"
      | "curious"
      | "reassuring"
      | "contemplative"
    )[];
  };

  failure_modes: string[];
};

const freezeContract = (
  contract: SegmentWritingContract
): SegmentWritingContract =>
  Object.freeze({
    ...contract,
    required_elements: Object.freeze([...contract.required_elements]),
    forbidden_elements: Object.freeze([...contract.forbidden_elements]),
    structural_requirements: Object.freeze({ ...contract.structural_requirements }),
    tone_constraints: Object.freeze({
      allows_uncertainty: contract.tone_constraints.allows_uncertainty,
      emotional_range: Object.freeze([...contract.tone_constraints.emotional_range]),
    }),
    failure_modes: Object.freeze([...contract.failure_modes]),
  }) as SegmentWritingContract;

const INTRO_CONTRACT = freezeContract({
  segment_key: "intro",
  required_elements: [
    "orientation to today's episode",
    "context framing without analysis",
  ],
  forbidden_elements: [
    "deep interpretation",
    "future prediction",
    "repetition of recent themes",
    "detailed thematic analysis",
  ],
  structural_requirements: {
    min_paragraphs: 1,
    max_paragraphs: 2,
    requires_example: false,
    requires_callback: false,
  },
  tone_constraints: {
    allows_uncertainty: false,
    emotional_range: ["grounded", "curious"],
  },
  failure_modes: [
    "dives into interpretation depth",
    "predicts future events",
    "recycles recent themes",
    "extends beyond orientation scope",
  ],
});

const MAIN_THEMES_CONTRACT = freezeContract({
  segment_key: "main_themes",
  required_elements: [
    "states primary meanings for today",
    "connects themes to current relevance",
    "provides at least one concrete example",
    "aligns framing to confidence level",
  ],
  forbidden_elements: [
    "topic sprawl beyond planned themes",
    "overconfident framing against confidence level",
    "future-casting beyond evidence",
    "irrelevant tangents",
  ],
  structural_requirements: {
    min_paragraphs: 2,
    max_paragraphs: 4,
    requires_example: true,
    requires_callback: false,
  },
  tone_constraints: {
    allows_uncertainty: true,
    emotional_range: ["grounded", "curious", "contemplative"],
  },
  failure_modes: [
    "missing concrete example",
    "exceeds topic bounds",
    "ignores stated confidence level",
    "fails to establish relevance",
  ],
});

const REFLECTION_CONTRACT = freezeContract({
  segment_key: "reflection",
  required_elements: [
    "integrates themes into a cohesive takeaway",
    "acknowledges uncertainty explicitly",
    "connects today's themes to lived perspective",
  ],
  forbidden_elements: [
    "introduces new concepts",
    "adds new analysis",
    "presents fresh advice",
    "ignores uncertainty already raised",
  ],
  structural_requirements: {
    min_paragraphs: 1,
    max_paragraphs: 3,
    requires_example: false,
    requires_callback: false,
  },
  tone_constraints: {
    allows_uncertainty: true,
    emotional_range: ["grounded", "contemplative", "reassuring"],
  },
  failure_modes: [
    "introduces new concepts",
    "shifts into analysis instead of reflection",
    "omits acknowledgment of uncertainty",
    "ignores integration with earlier segments",
  ],
});

const CLOSING_CONTRACT = freezeContract({
  segment_key: "closing",
  required_elements: [
    "delivers emotional resolution for today",
    "reaffirms present-day stance without expansion",
  ],
  forbidden_elements: [
    "introduces new information",
    "adds analysis",
    "projects beyond the current day",
    "callbacks to prior days or future plans",
  ],
  structural_requirements: {
    min_paragraphs: 1,
    max_paragraphs: 2,
    requires_example: false,
    requires_callback: false,
  },
  tone_constraints: {
    allows_uncertainty: false,
    emotional_range: ["reassuring", "grounded"],
  },
  failure_modes: [
    "adds new information during closure",
    "shifts into analysis",
    "extends beyond present-day focus",
    "reopens earlier topics instead of resolving",
  ],
});

const SEGMENT_WRITING_CONTRACTS: Record<
  SegmentWritingContract["segment_key"],
  SegmentWritingContract
> = Object.freeze({
  intro: INTRO_CONTRACT,
  main_themes: MAIN_THEMES_CONTRACT,
  reflection: REFLECTION_CONTRACT,
  closing: CLOSING_CONTRACT,
});

export function getWritingContract(
  segment_key: SegmentWritingContract["segment_key"]
): SegmentWritingContract {
  const contract = SEGMENT_WRITING_CONTRACTS[segment_key];
  if (!contract) {
    throw new Error(`Unknown segment_key ${segment_key}`);
  }
  return contract;
}


