import type { PriorScripts } from "../../runner/priorScripts.js";

export type SegmentPromptInput = {
  episode_date: string; // ISO date
  segment_key: "intro" | "main_themes" | "reflection" | "closing";

  intent: string[]; // must be non-empty
  included_tags: string[]; // from editorial plan
  suppressed_tags: string[]; // from editorial plan
  confidence_level: "high" | "medium" | "low";

  continuity_notes?: string[]; // optional, scoped to segment

  // Optional when performing lexical fatigue checks against an already-written script.
  script_text?: string;

  constraints: {
    max_ideas: number; // required, >= 1
    must_acknowledge_uncertainty: boolean;
    ban_repetition: boolean;
    /** Optional editorial direction from reviewer (regeneration flow). Sanitized before prompt injection. */
    editorial_feedback?: string;
    /** Scripts from earlier this week for narrative arc continuity. Injected into prompt when present. */
    prior_scripts?: PriorScripts;
  };
};

