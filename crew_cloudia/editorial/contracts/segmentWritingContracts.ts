import { SegmentWritingContract } from "../types/SegmentWritingContract.js";
export type { SegmentWritingContract } from "../types/SegmentWritingContract.js";

const freezeContract = (
  contract: SegmentWritingContract
): SegmentWritingContract =>
  Object.freeze({
    ...contract,
    required_sections: Object.freeze(
      contract.required_sections.map((section) => Object.freeze({ ...section }))
    ),
    forbidden_elements: Object.freeze({
      phrases: Object.freeze([...contract.forbidden_elements.phrases]),
      claims: Object.freeze([...contract.forbidden_elements.claims]),
      tones: Object.freeze([...contract.forbidden_elements.tones]),
    }),
    voice_constraints: Object.freeze({
      perspective: contract.voice_constraints.perspective,
      allowed_tones: Object.freeze([...contract.voice_constraints.allowed_tones]),
      disallowed_tones: Object.freeze([...contract.voice_constraints.disallowed_tones]),
    }),
    length_constraints: Object.freeze({
      min_words: contract.length_constraints.min_words,
      max_words: contract.length_constraints.max_words,
    }),
    formatting_rules: Object.freeze({
      allow_bullets: contract.formatting_rules.allow_bullets,
      allow_questions: contract.formatting_rules.allow_questions,
    }),
  }) as SegmentWritingContract;

const INTRO_CONTRACT = freezeContract({
  segment_key: "intro",
  segment_kind: "orientation",
  intent: "orient",
  required_sections: [
    {
      key: "orientation",
      description: "Orient the listener to today's episode and context.",
      required: true,
      enforcement: "semantic",
    },
    {
      key: "context_framing",
      description: "Provide context framing without deep analysis.",
      required: true,
      enforcement: "semantic",
    },
  ],
  forbidden_elements: {
    phrases: ["deep interpretation", "detailed thematic analysis", "repetition of recent themes"],
    claims: ["predicts future events"],
    tones: ["overconfident"],
  },
  voice_constraints: {
    perspective: "second_person",
    allowed_tones: ["grounded", "curious"],
    disallowed_tones: ["reassuring", "contemplative", "dramatic"],
  },
  length_constraints: {
    min_words: 80,
    max_words: 140,
  },
  formatting_rules: {
    allow_bullets: false,
    allow_questions: true,
  },
});

const MAIN_THEMES_CONTRACT = freezeContract({
  segment_key: "main_themes",
  segment_kind: "interpretation",
  intent: "interpret",
  required_sections: [
    {
      key: "primary_meanings",
      description: "State primary meanings for today.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "relevance",
      description: "Connect themes to current relevance.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "concrete_example",
      description: "Provide at least one concrete example.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "confidence_alignment",
      description: "Align framing to the stated confidence level.",
      required: true,
      enforcement: "structural",
    },
  ],
  forbidden_elements: {
    phrases: ["topic sprawl beyond planned themes", "irrelevant tangents"],
    claims: ["future-casting beyond evidence", "overconfident framing against confidence level"],
    tones: ["overconfident", "fatalistic"],
  },
  voice_constraints: {
    perspective: "second_person",
    allowed_tones: ["grounded", "curious", "contemplative"],
    disallowed_tones: ["reassuring", "dramatic"],
  },
  length_constraints: {
    min_words: 200,
    max_words: 400,
  },
  formatting_rules: {
    allow_bullets: true,
    allow_questions: true,
  },
});

const REFLECTION_CONTRACT = freezeContract({
  segment_key: "reflection",
  segment_kind: "reflection",
  intent: "reflect",
  required_sections: [
    {
      key: "integration",
      description: "Integrate today's themes into a cohesive takeaway.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "uncertainty",
      description: "Acknowledge uncertainty explicitly.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "lived_perspective",
      description: "Connect themes to a lived perspective without adding new analysis.",
      required: true,
      enforcement: "structural",
    },
  ],
  forbidden_elements: {
    phrases: ["introduces new concepts", "adds new analysis", "presents fresh advice"],
    claims: ["ignores uncertainty already raised"],
    tones: ["overconfident", "dismissive"],
  },
  voice_constraints: {
    perspective: "first_person",
    allowed_tones: ["grounded", "contemplative", "reassuring"],
    disallowed_tones: ["curious", "dramatic"],
  },
  length_constraints: {
    min_words: 120,
    max_words: 220,
  },
  formatting_rules: {
    allow_bullets: false,
    allow_questions: true,
  },
});

const CLOSING_CONTRACT = freezeContract({
  segment_key: "closing",
  segment_kind: "closure",
  intent: "close",
  required_sections: [
    {
      key: "emotional_resolution",
      description: "Deliver an emotional resolution for today.",
      required: true,
      enforcement: "structural",
    },
    {
      key: "reaffirmation",
      description: "Reaffirm the present-day stance without expansion.",
      required: true,
      enforcement: "structural",
    },
  ],
  forbidden_elements: {
    phrases: [
      "introduces new information",
      "adds analysis",
      "projects beyond the current day",
      "callbacks to prior days or future plans",
    ],
    claims: [],
    tones: ["overconfident", "detached"],
  },
  voice_constraints: {
    perspective: "second_person",
    allowed_tones: ["reassuring", "grounded"],
    disallowed_tones: ["dramatic", "confrontational", "clinical"],
  },
  length_constraints: {
    min_words: 60,
    max_words: 120,
  },
  formatting_rules: {
    allow_bullets: false,
    allow_questions: false,
  },
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


