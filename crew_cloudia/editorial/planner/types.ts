export type SegmentKeyV1 = "intro" | "main_themes" | "reflection" | "closing";

export type ConfidenceLevel = "high" | "medium" | "low";

export type TagSalience = "primary" | "secondary" | "background";

export type Speakability = "must_say" | "can_say" | "avoid";

export type DailyInterpretation = {
  episode_date: string; // YYYY-MM-DD
  confidence_level: ConfidenceLevel;

  // Output of Phase 5 meaning compiler
  // Tags are flat strings (already compiled + deduped + suppressed at interpretation-layer)
  tags: Array<{
    tag: string; // canonical tag id (string)
    field: string; // e.g. "theme" | "tone" | "advice" ... (don’t hardcode list)
    salience: TagSalience;
    speakability: Speakability;
    rule_ids: string[]; // provenance from interpretation compiler
  }>;

  // For traceability: what Phase 5 suppressed already
  suppressed_tags?: Array<{
    tag: string;
    reason: string; // e.g. "avoid" | "limit" | "canon" | ...
    rule_ids?: string[];
  }>;
};

export type RecentEditorialMemory = {
  // Mocked input; hardcoded arrays in tests/fixtures for now
  // “theme ids we already talked about recently”
  recent_tags: Array<{
    tag: string;
    last_seen_date: string; // YYYY-MM-DD
    segment_key?: SegmentKeyV1;
  }>;
};

export type SegmentEditorialPlan = {
  segment_key: SegmentKeyV1;

  // “intent tags”, not prose. These are editorial intent tokens, *not* interpretation tags.
  // Examples: "introduce_one_theme", "headline_primary", "reflect_on_uncertainty", "close_with_action"
  intent: string[];

  included_tags: string[]; // subset of DailyInterpretation.tags[].tag
  suppressed_tags: string[]; // subset of DailyInterpretation.tags[].tag (explicitly suppressed here)
  rationale: string[]; // rule IDs from editorial planner (not sentences)
};

export type EpisodeEditorialPlan = {
  episode_date: string; // YYYY-MM-DD
  segments: SegmentEditorialPlan[];
  continuity_notes: {
    callbacks: string[]; // tags that were referenced as callbacks
    avoided_repetition: string[]; // tags suppressed due to repetition
  };
  debug: {
    // deterministic trace (no prose)
    selected_by_segment: Record<SegmentKeyV1, string[]>;
    suppressed_by_rule: Record<string, string[]>; // rule_id -> [tag...]
  };
};

