export type ViolationClass =
  | "BLOCKING"
  | "REWRITE_ELIGIBLE"
  | "WARNING"
  | "IGNORED";

export interface EditorialViolation {
  id: string;
  class: ViolationClass;
  source: string;
  applies_to: "all" | "structural_only";
  description: string;
}

export const EDITORIAL_VIOLATIONS = {
  CANON_PREDICTIVE_CLAIM: {
    id: "CANON_PREDICTIVE_CLAIM",
    class: "BLOCKING",
    source: "canon_enforcement",
    applies_to: "all",
    description: "Deterministic prediction of future outcomes."
  },
  CANON_CAUSAL_OVERREACH: {
    id: "CANON_CAUSAL_OVERREACH",
    class: "BLOCKING",
    source: "canon_enforcement",
    applies_to: "all",
    description: "Claims causal certainty from astrological factors."
  },
  CANON_PROHIBITED_ADVICE: {
    id: "CANON_PROHIBITED_ADVICE",
    class: "BLOCKING",
    source: "canon_enforcement",
    applies_to: "all",
    description: "Medical, legal, financial, or moral prescriptions."
  },
  ASTRO_FACT_MISMATCH: {
    id: "ASTRO_FACT_MISMATCH",
    class: "BLOCKING",
    source: "ephemeris_consistency",
    applies_to: "all",
    description: "Astrological claim conflicts with sky state."
  },
  ASTRO_INVALID_RETROGRADE: {
    id: "ASTRO_INVALID_RETROGRADE",
    class: "BLOCKING",
    source: "ephemeris_consistency",
    applies_to: "all",
    description: "Incorrectly claims retrograde or direct status."
  },
  STRUCTURE_MISSING_REQUIRED_ARC: {
    id: "STRUCTURE_MISSING_REQUIRED_ARC",
    class: "BLOCKING",
    source: "structural_validators",
    applies_to: "structural_only",
    description: "Required narrative arc or section is absent."
  },
  STRUCTURE_MISSING_GROUNDING: {
    id: "STRUCTURE_MISSING_GROUNDING",
    class: "BLOCKING",
    source: "structural_validators",
    applies_to: "structural_only",
    description: "Required grounding example or sky reference is missing."
  },
  BANNED_LANGUAGE_PRESENT: {
    id: "BANNED_LANGUAGE_PRESENT",
    class: "BLOCKING",
    source: "phrase_blacklist",
    applies_to: "all",
    description: "Contains prohibited clichés, fortune-telling, or metaphors."
  },
  SEGMENT_SCHEMA_MISMATCH: {
    id: "SEGMENT_SCHEMA_MISMATCH",
    class: "BLOCKING",
    source: "segment_schema_validation",
    applies_to: "all",
    description: "Output violates the segment's declared schema or intent."
  },
  THEME_UNCLEAR: {
    id: "THEME_UNCLEAR",
    class: "REWRITE_ELIGIBLE",
    source: "interpretive_clarity_checks",
    applies_to: "all",
    description: "Primary theme is vague or underdeveloped."
  },
  THEME_MULTIPLE_COMPETING: {
    id: "THEME_MULTIPLE_COMPETING",
    class: "REWRITE_ELIGIBLE",
    source: "interpretive_clarity_checks",
    applies_to: "all",
    description: "Multiple competing primary themes."
  },
  GROUNDING_THIN: {
    id: "GROUNDING_THIN",
    class: "REWRITE_ELIGIBLE",
    source: "structural_diagnostics",
    applies_to: "structural_only",
    description: "Grounding example exists but is generic or underused."
  },
  TONE_MILD_DRIFT: {
    id: "TONE_MILD_DRIFT",
    class: "REWRITE_ELIGIBLE",
    source: "tone_analysis",
    applies_to: "all",
    description: "Tone slightly deviates within allowed bounds."
  },
  INTRA_SEGMENT_REDUNDANCY: {
    id: "INTRA_SEGMENT_REDUNDANCY",
    class: "REWRITE_ELIGIBLE",
    source: "repetition_detection",
    applies_to: "all",
    description: "Same idea restated within the segment."
  },
  CROSS_EPISODE_THEME_REPEAT: {
    id: "CROSS_EPISODE_THEME_REPEAT",
    class: "WARNING",
    source: "continuity_checks",
    applies_to: "all",
    description: "Theme resembles a recent episode."
  },
  LANGUAGE_GENERIC: {
    id: "LANGUAGE_GENERIC",
    class: "WARNING",
    source: "specificity_heuristics",
    applies_to: "all",
    description: "Generic or vague language."
  },
  MISSED_INTERPRETIVE_OPPORTUNITY: {
    id: "MISSED_INTERPRETIVE_OPPORTUNITY",
    class: "WARNING",
    source: "heuristic_analysis",
    applies_to: "all",
    description: "Interesting transit noted but underused."
  },
  SUBJECTIVE_FLATNESS: {
    id: "SUBJECTIVE_FLATNESS",
    class: "IGNORED",
    source: "heuristic_opinion",
    applies_to: "all",
    description: "Opinionated feedback such as \"feels flat.\""
  },
  ENGAGEMENT_SPECULATION: {
    id: "ENGAGEMENT_SPECULATION",
    class: "IGNORED",
    source: "engagement_speculation",
    applies_to: "all",
    description: "Predictions about listener behavior or virality."
  }
} satisfies Record<string, EditorialViolation>;

export type EditorialViolationId = keyof typeof EDITORIAL_VIOLATIONS;

