import { SegmentKeyV1, Speakability, TagSalience } from "./types.js";

export const ED_RULE_INTRO_MAX_NEW_IDEAS_1 = "ED_RULE_INTRO_MAX_NEW_IDEAS_1";
export const ED_RULE_ONE_CORE_THEME_PER_SEGMENT =
  "ED_RULE_ONE_CORE_THEME_PER_SEGMENT";
export const ED_RULE_BACKGROUND_NEVER_HEADLINES =
  "ED_RULE_BACKGROUND_NEVER_HEADLINES";
export const ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY =
  "ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY";
export const ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK =
  "ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK";
export const ED_RULE_SPEAKABILITY_MUST_SAY_WINS =
  "ED_RULE_SPEAKABILITY_MUST_SAY_WINS";
export const ED_RULE_SPEAKABILITY_AVOID_NEVER =
  "ED_RULE_SPEAKABILITY_AVOID_NEVER";
export const ED_RULE_SEGMENT_IDEA_BUDGETS = "ED_RULE_SEGMENT_IDEA_BUDGETS";

export const SEGMENT_IDEA_BUDGETS: Record<SegmentKeyV1, number> = {
  intro: 1,
  main_themes: 3,
  reflection: 2,
  closing: 1,
};

export const RECENT_THEME_WINDOW_DAYS = 3;

export const SEGMENT_INTENTS_V1: Record<SegmentKeyV1, string[]> = {
  intro: ["introduce_one_theme"],
  main_themes: ["headline_primary"],
  reflection: ["integrate_and_reflect"],
  closing: ["close_with_action"],
};

const speakabilityRank: Record<Speakability, number> = {
  must_say: 2,
  can_say: 1,
  avoid: 0,
};

const salienceRank: Record<TagSalience, number> = {
  primary: 2,
  secondary: 1,
  background: 0,
};

export const compareTagsDeterministically = (
  a: { speakability: Speakability; salience: TagSalience; tag: string },
  b: { speakability: Speakability; salience: TagSalience; tag: string }
) => {
  const speakabilityDelta =
    speakabilityRank[b.speakability] - speakabilityRank[a.speakability];
  if (speakabilityDelta !== 0) return speakabilityDelta;

  const salienceDelta = salienceRank[b.salience] - salienceRank[a.salience];
  if (salienceDelta !== 0) return salienceDelta;

  return a.tag.localeCompare(b.tag);
};

export const isRecentTag = (
  episodeDate: string,
  tagLastSeen: string,
  windowDays = RECENT_THEME_WINDOW_DAYS
) => {
  const toDate = (value: string) => new Date(`${value}T00:00:00Z`).getTime();
  const diffMs = Math.abs(toDate(episodeDate) - toDate(tagLastSeen));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays <= windowDays;
};
