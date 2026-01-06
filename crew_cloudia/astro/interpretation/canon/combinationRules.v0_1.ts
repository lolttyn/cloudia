/**
 * Combination Rules v0.1
 * 
 * Canonical combination rules for the astro interpreter.
 * These rules match transits to interpretation tags.
 * 
 * Version: 0.1
 * Pattern: rule.{planet}.{sign}.{salience}
 */

import { CombinationRule } from "../interpreter/applyCombinationRules.js";

/**
 * Canonical combination rules v0.1
 * 
 * For Phase 5.2, this is a minimal set. Rules can be expanded
 * as needed while maintaining versioning.
 */
export const COMBINATION_RULES_V0_1: CombinationRule[] = [
  // Primary salience rules
  {
    id: "rule.mars.cancer.primary",
    version: "0.1",
    priority: 10,
    layer: "B",
    when: { planet: "mars", sign: "cancer", salience: "primary" },
    outputs: {
      focus: ["mars-cancer-focus"],
      interpretation: ["assertive-nurture"],
      rationale: ["orb-0-8"],
      highlights: ["heightened-drive"],
      risks: ["impulsive-reactivity"],
      mitigations: ["pause-then-act"],
      opportunities: ["channel-energy"],
      actions: ["choose-constructive-action"],
      signals: ["core-theme-mars-cancer"],
      counter_signals: ["use-care"],
      core_theme_tags: ["core-theme-mars-cancer"],
      emotional_tone_tags: ["energized-caution"],
      likely_experience_tags: ["pressure-at-home"],
      recommended_response_tags: ["respond-with-care"],
    },
  },
  {
    id: "rule.venus.capricorn.secondary",
    version: "0.1",
    priority: 6,
    layer: "B",
    when: { planet: "venus", sign: "capricorn", salience: "secondary" },
    outputs: {
      focus: ["venus-cap-focus"],
      interpretation: ["practical-harmony"],
      rationale: ["steady-influence"],
      highlights: ["stability-seeking"],
      risks: ["over-caution"],
      mitigations: ["balance-pleasure"],
      opportunities: ["steady-growth"],
      actions: ["plan-deliberately"],
      signals: ["stability-seeking"],
      counter_signals: ["avoid-overcontrol"],
      core_theme_tags: ["stability-seeking"],
      emotional_tone_tags: ["calm"],
      likely_experience_tags: ["measured-progress"],
      recommended_response_tags: ["pace-yourself"],
    },
  },
  {
    id: "rule.saturn.pisces.background",
    version: "0.1",
    priority: 3,
    layer: "B",
    when: { planet: "saturn", sign: "pisces", salience: "background" },
    outputs: {
      focus: ["saturn-pisces-focus"],
      interpretation: ["diffuse-responsibility"],
      rationale: ["long-arc"],
      highlights: ["slow-grind"],
      risks: ["fatigue"],
      mitigations: ["rest-discipline"],
      opportunities: ["patient-building"],
      actions: ["incremental-steps"],
      signals: ["slow-grind"],
      counter_signals: ["watch-exhaustion"],
      core_theme_tags: ["slow-grind"],
      emotional_tone_tags: ["drained"],
      likely_experience_tags: ["long-haul"],
      recommended_response_tags: ["keep-boundaries"],
    },
  },
];

export const COMBINATION_RULES_V0_1_VERSION = "0.1";

