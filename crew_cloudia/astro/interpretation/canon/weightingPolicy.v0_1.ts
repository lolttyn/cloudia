/**
 * Weighting Policy v0.1
 * 
 * Canonical weighting policy for the astro interpreter.
 * Determines speakability and weights based on transit salience.
 * 
 * Version: 0.1
 */

import { WeightingPolicy } from "../interpreter/applyWeighting.js";

/**
 * Canonical weighting policy v0.1
 * 
 * Maps transit salience to speakability and weights.
 */
export const WEIGHTING_POLICY_V0_1: WeightingPolicy = {
  rules: [
    {
      id: "weight.primary",
      priority: 5,
      when: { salience: "primary" },
      weights: {
        time_horizon: "short",
        psychological_weight: 0.7,
        behavioral_weight: 0.6,
        speakability: "must_say",
      },
    },
    {
      id: "weight.secondary",
      priority: 4,
      when: { salience: "secondary" },
      weights: {
        time_horizon: "medium",
        psychological_weight: 0.5,
        behavioral_weight: 0.5,
        speakability: "can_say",
      },
    },
    {
      id: "weight.background",
      priority: 2,
      when: { salience: "background" },
      weights: {
        time_horizon: "long",
        psychological_weight: 0.3,
        behavioral_weight: 0.3,
        speakability: "avoid",
      },
    },
  ],
};

export const WEIGHTING_POLICY_V0_1_VERSION = "0.1";

