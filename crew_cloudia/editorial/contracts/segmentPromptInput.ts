export type SegmentPromptInput = {
  episode_date: string; // ISO date
  segment_key: "intro" | "main_themes" | "reflection" | "closing";

  intent: string[]; // must be non-empty
  included_tags: string[]; // from editorial plan
  suppressed_tags: string[]; // from editorial plan
  confidence_level: "high" | "medium" | "low";

  continuity_notes?: string[]; // optional, scoped to segment

  constraints: {
    max_ideas: number; // required, >= 1
    must_acknowledge_uncertainty: boolean;
    ban_repetition: boolean;
  };
};


