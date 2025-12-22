import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { AdherenceInput, AdherenceResult, ScoreAdjustment } from "./types.js";
import { normalizeText } from "./utils/textNormalization.js";
import { checkClosingRepetition } from "./utils/repetitionCheck.js";

export const HARD_BANNED_PHRASES = [
  "primary meanings",
  "relevance",
  "concrete example",
  "confidence alignment",
  "interpretive frame",
  "temporal phase",
  "intensity modifier",
  "confidence level",
  "meaning over minutiae",
  "dominant contrast",
  "contrast axis",
  "focus is firmly on",
];

const SYSTEM_LEVEL_EXPLANATION_PATTERNS = [
  "in astrology",
  "astrologically speaking",
  "represents the idea of",
  "dominant contrast",
  "contrast axis",
  "meaning over minutiae",
  "focus is firmly on",
];

const ABSTRACT_NOUNS = ["meaning", "values", "beliefs", "themes", "concepts"];

const LUNATION_FEELING_MARKERS = [
  "feels different",
  "shift",
  "reset",
  "clean slate",
  "letting go",
  "opening",
  "closing",
  "done with",
];

const HUMAN_REFERENTS = [
  "text",
  "phone",
  "inbox",
  "coffee",
  "clothes",
  "meeting",
  "project",
  "friend",
  "partner",
  "coworker",
];

const SOCIAL_SCENARIOS = [
  "overshare",
  "avoid",
  "conversation",
  "boundary",
  "space",
  "seen",
];

const EMBODIED_SIGNALS = [
  "gut",
  "chest",
  "body",
  "nervous system",
  "tension",
  "relief",
  "restless",
];

const AFFORDANCE_MARKERS = [
  "you dont have to",
  "not today",
  "let this sit",
  "this isnt urgent",
  "take the space",
  "wait",
  "stop",
  "dont",
];

const BODY_OR_EMOTION_MARKERS = [
  "you ",
  " your",
  "body",
  "feel",
  "feels",
  "feeling",
  "felt",
  "emotion",
  "emotional",
  "gut",
  "chest",
  "nervous system",
  "heart",
  "hands",
  "skin",
  "breath",
  "breathe",
  "breathing",
  "touch",
  "tear",
  "cry",
  "laugh",
  "stomach",
  "conversation",
  "text",
  "call",
  "voice",
];

const CHRONOLOGY_MARKERS = ["entered", "after", "moves into", "moving into", "moved into", "entering"];

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

const containsAny = (text: string, markers: string[]): boolean =>
  markers.some((marker) => text.includes(marker));

const addScore = (
  list: ScoreAdjustment[],
  adjustment: ScoreAdjustment
): void => {
  list.push(adjustment);
};

function enforceHardBans(normalized: string, blocking: Set<string>): void {
  for (const phrase of HARD_BANNED_PHRASES) {
    const normalizedPhrase = normalizeText(phrase);
    if (normalized.includes(normalizedPhrase)) {
      blocking.add(`HARD_BANNED_LANGUAGE:${normalizedPhrase}`);
    }
  }
}

function enforceSystemLevel(
  sentences: string[],
  blocking: Set<string>
): void {
  sentences.forEach((sentence, idx) => {
    const lower = sentence.toLowerCase();
    const matched = SYSTEM_LEVEL_EXPLANATION_PATTERNS.some((p) => lower.includes(p));
    if (!matched) return;

    const neighbor = [sentence, sentences[idx + 1] ?? ""].join(" ").toLowerCase();
    const hasLived = BODY_OR_EMOTION_MARKERS.some((marker) => neighbor.includes(marker));
    if (!hasLived) {
      blocking.add("SYSTEM_LEVEL_EXPLANATION");
    }
  });
}

function enforceAbstractWithoutTranslation(
  paragraphs: string[],
  blocking: Set<string>
): void {
  for (const paragraph of paragraphs) {
    const lower = paragraph.toLowerCase();
    const hasAbstract = ABSTRACT_NOUNS.some((n) => lower.includes(n));
    if (!hasAbstract) continue;

    const hasHumanReferent = containsAny(lower, [
      ...HUMAN_REFERENTS,
      ...SOCIAL_SCENARIOS,
      ...EMBODIED_SIGNALS,
      "you ",
      " your",
      "people",
      "someone",
    ]);
    if (!hasHumanReferent) {
      blocking.add("ABSTRACT_WITHOUT_TRANSLATION");
    }
  }
}

function enforceLunationFrontLoad(
  script: string,
  segment_key: string,
  frame: InterpretiveFrame,
  blocking: Set<string>
): void {
  if (!frame.lunation) return;
  if (!["intro", "main_themes", "closing"].includes(segment_key)) return;

  const lower = script.toLowerCase();
  const lunationKeywords = ["new moon", "full moon", "moon", "lunation"];
  const mention = lunationKeywords
    .map((k) => lower.indexOf(k))
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];

  if (mention === undefined) {
    blocking.add("LUNATION_NOT_FRONT_LOADED");
    return;
  }

  const sentences = splitSentences(script);
  const firstMentionSentence = sentences.find((s) =>
    lunationKeywords.some((k) => s.toLowerCase().includes(k))
  );

  if (!firstMentionSentence) {
    blocking.add("LUNATION_NOT_FRONT_LOADED");
    return;
  }

  const lowerSentence = firstMentionSentence.toLowerCase();
  const hasFeelingMarker = LUNATION_FEELING_MARKERS.some((m) =>
    lowerSentence.includes(m)
  );

  const chronologyIndex = CHRONOLOGY_MARKERS.map((m) => lowerSentence.indexOf(m))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  const feelingIndex = LUNATION_FEELING_MARKERS.map((m) => lowerSentence.indexOf(m))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0] ?? -1;

  const chronologyPrecedesFeeling =
    chronologyIndex >= 0 && (feelingIndex === -1 || chronologyIndex < feelingIndex);

  if (!hasFeelingMarker || chronologyPrecedesFeeling) {
    blocking.add("LUNATION_NOT_FRONT_LOADED");
  }
}

function enforceRelationalTranslation(
  lower: string,
  segment_key: string,
  blocking: Set<string>
): void {
  if (segment_key !== "main_themes") return;
  const hasHuman = containsAny(lower, HUMAN_REFERENTS);
  const hasSocial = containsAny(lower, SOCIAL_SCENARIOS);
  const hasEmbodied = containsAny(lower, EMBODIED_SIGNALS);
  if (!hasHuman && !hasSocial && !hasEmbodied) {
    blocking.add("NO_RELATIONAL_TRANSLATION");
  }
}

function enforceBehavioralAffordance(
  lower: string,
  segment_key: string,
  blocking: Set<string>
): void {
  if (!["main_themes", "closing"].includes(segment_key)) return;
  if (!containsAny(lower, AFFORDANCE_MARKERS)) {
    blocking.add("NO_BEHAVIORAL_AFFORDANCE");
  }
}

function applyAuthorialCompression(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const clauseMarkers = ["which means", "this is because"];
    const occurrences = clauseMarkers.reduce(
      (count, marker) => count + (lower.split(marker).length - 1),
      0
    );
    if (occurrences > 1) {
      addScore(adjustments, {
        code: "AUTHORIAL_COMPRESSION_PENALTY",
        delta: -1,
        reason: "Stacked explanatory clauses reduce compression.",
      });
    } else {
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (wordCount > 0 && wordCount <= 14 && !lower.includes("because")) {
        addScore(adjustments, {
          code: "AUTHORIAL_COMPRESSION_REWARD",
          delta: 0.5,
          reason: "Concise assertion/metaphor without trailing explanation.",
        });
      }
    }
  }
  return adjustments;
}

function applyPermissionWithTeeth(scriptLower: string): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  const imperativePatterns = [
    /\byou can\b/,
    /\bsay no\b/,
    /\bskip\b/,
    /\bdrop it\b/,
    /\bstep back\b/,
    /\btake the space\b/,
  ];
  const paddingMarkers = ["gentle", "just a reminder", "just wanted to", "maybe", "perhaps"];

  if (imperativePatterns.some((re) => re.test(scriptLower))) {
    addScore(adjustments, {
      code: "PERMISSION_WITH_TEETH_REWARD",
      delta: 0.5,
      reason: "Direct imperative/permission language present.",
    });
  }

  if (paddingMarkers.some((p) => scriptLower.includes(p))) {
    addScore(adjustments, {
      code: "PERMISSION_WITH_TEETH_PENALTY",
      delta: -0.5,
      reason: "Padding language softens directives.",
    });
  }

  return adjustments;
}

function applyConversationalAuthority(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  const hedges = ["you may find", "it might be helpful"];
  const allText = sentences.join(" ").toLowerCase();

  if (hedges.some((h) => allText.includes(h))) {
    addScore(adjustments, {
      code: "CONVERSATIONAL_AUTHORITY_PENALTY",
      delta: -1,
      reason: "Hedging language weakens authority.",
    });
  }

  const youCount = (allText.match(/\byou\b/g) || []).length;
  const shortDeclaratives = sentences.filter(
    (s) => s.split(/\s+/).filter(Boolean).length <= 10
  ).length;
  if (youCount >= 2 && shortDeclaratives > 0) {
    addScore(adjustments, {
      code: "CONVERSATIONAL_AUTHORITY_REWARD",
      delta: 0.5,
      reason: "Second-person declaratives provide authority.",
    });
  }

  return adjustments;
}

function applyEnergyEmbodiment(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!lower.includes("energy")) continue;

    const hasSocialOrBody = containsAny(lower, [
      ...HUMAN_REFERENTS,
      ...EMBODIED_SIGNALS,
      "people",
      "you",
    ]);

    if (hasSocialOrBody) {
      addScore(adjustments, {
        code: "ENERGY_EMBODIMENT_REWARD",
        delta: 0.5,
        reason: "Energy is grounded in social/body context.",
      });
    } else {
      addScore(adjustments, {
        code: "ENERGY_EMBODIMENT_PENALTY",
        delta: -0.5,
        reason: "Energy is referenced abstractly without embodiment.",
      });
    }
  }
  return adjustments;
}

export function evaluateAdherenceRubric(input: AdherenceInput): AdherenceResult {
  const blocking = new Set<string>();
  const warnings = new Set<string>();
  const score_breakdown: ScoreAdjustment[] = [];

  const script = input.script ?? "";
  const normalized = normalizeText(script);
  const sentences = splitSentences(script);
  const paragraphs = script.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lower = script.toLowerCase().replace(/’/g, "'");

  enforceHardBans(normalized, blocking);
  enforceSystemLevel(sentences, blocking);
  enforceAbstractWithoutTranslation(paragraphs, blocking);
  enforceLunationFrontLoad(script, input.segment_key, input.interpretive_frame, blocking);
  enforceRelationalTranslation(lower, input.segment_key, blocking);
  enforceBehavioralAffordance(lower, input.segment_key, blocking);

  const repetition = input.segment_key === "closing" && input.previous_closings?.length
    ? checkClosingRepetition(script, input.previous_closings)
    : undefined;

  if (repetition?.exactMatch) {
    blocking.add("REPEATED_CLOSING_TEMPLATE");
  } else if (repetition && repetition.highestOverlap >= 0.7) {
    addScore(score_breakdown, {
      code: "REPEATED_CLOSING_TEMPLATE",
      delta: -1,
      reason: `High overlap (${Math.round(repetition.highestOverlap * 100)}%) with prior closing.`,
    });
    warnings.add("REPEATED_CLOSING_TEMPLATE");
  }

  [
    ...applyAuthorialCompression(sentences),
    ...applyPermissionWithTeeth(lower),
    ...applyConversationalAuthority(sentences),
    ...applyEnergyEmbodiment(sentences),
  ].forEach((adj) => score_breakdown.push(adj));

  const score = score_breakdown.reduce((sum, adj) => sum + adj.delta, 0);

  return {
    blocking_reasons: Array.from(blocking),
    warnings: Array.from(warnings),
    score,
    score_breakdown,
  };
}

