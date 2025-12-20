import { DailyInterpretation, RecentEditorialMemory } from "../types.js";

export const interpretation_high_confidence_basic: DailyInterpretation = {
  episode_date: "2025-02-10",
  confidence_level: "high",
  tags: [
    {
      tag: "core-theme-alpha",
      field: "theme",
      salience: "primary",
      speakability: "must_say",
      rule_ids: ["rule.core.alpha"],
    },
    {
      tag: "secondary-beta",
      field: "tone",
      salience: "secondary",
      speakability: "can_say",
      rule_ids: ["rule.secondary.beta"],
    },
    {
      tag: "background-gamma",
      field: "theme",
      salience: "background",
      speakability: "can_say",
      rule_ids: ["rule.background.gamma"],
    },
    {
      tag: "avoid-delta",
      field: "advice",
      salience: "primary",
      speakability: "avoid",
      rule_ids: ["rule.avoid.delta"],
    },
  ],
};

export const interpretation_low_confidence_with_repeats: DailyInterpretation = {
  episode_date: "2025-02-12",
  confidence_level: "low",
  tags: [
    {
      tag: "repeat-must",
      field: "theme",
      salience: "primary",
      speakability: "must_say",
      rule_ids: ["rule.repeat.must"],
    },
    {
      tag: "repeat-can",
      field: "theme",
      salience: "secondary",
      speakability: "can_say",
      rule_ids: ["rule.repeat.can"],
    },
    {
      tag: "fresh-primary",
      field: "advice",
      salience: "primary",
      speakability: "can_say",
      rule_ids: ["rule.fresh.primary"],
    },
    {
      tag: "background-note",
      field: "theme",
      salience: "background",
      speakability: "can_say",
      rule_ids: ["rule.background.note"],
    },
  ],
};

export const interpretation_lunation_special: DailyInterpretation = {
  episode_date: "2025-12-19",
  confidence_level: "high",
  lunation: { kind: "new", sign: "sagittarius", signal_key: "new_moon_in_sagittarius" },
  tags: [
    {
      tag: "new_moon_in_sagittarius",
      field: "theme",
      salience: "primary",
      speakability: "must_say",
      rule_ids: ["rule.lunation.primary"],
    },
    {
      tag: "supporting-note",
      field: "advice",
      salience: "secondary",
      speakability: "can_say",
      rule_ids: ["rule.supporting.note"],
    },
    {
      tag: "background-thread",
      field: "theme",
      salience: "background",
      speakability: "can_say",
      rule_ids: ["rule.background.thread"],
    }
  ],
};

export const memory_with_recent_theme_repetition: RecentEditorialMemory = {
  recent_tags: [
    { tag: "repeat-must", last_seen_date: "2025-02-10", segment_key: "intro" },
    { tag: "repeat-can", last_seen_date: "2025-02-10", segment_key: "main_themes" },
  ],
};

