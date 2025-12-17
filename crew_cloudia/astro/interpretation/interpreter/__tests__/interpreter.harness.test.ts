import { describe, expect, it } from "vitest";
import { runInterpreter } from "../runInterpreter.js";
import { CombinationRule, MockFacts } from "../applyCombinationRules.js";
import { WeightingPolicy } from "../applyWeighting.js";
import { CanonConstraintSchema } from "../../canon/canon.schemas.js";

const MOCK_FACTS: MockFacts = {
  date: "2025-01-15",
  transits: [
    {
      planet: "mars",
      sign: "cancer",
      salience: "primary",
      orb_deg: 0.8,
      duration_days: 3,
      retrograde: false,
    },
  ],
};

const BASE_COMBINATION_RULE: CombinationRule = {
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
};

const WEIGHTING_POLICY: WeightingPolicy = {
  rules: [
    {
      id: "weight.primary",
      priority: 5,
      when: { salience: "primary" },
      weights: {
        time_horizon: "short",
        psychological_weight: 0.7,
        behavioral_weight: 0.6,
        speakability: "high",
      },
    },
  ],
};

const CANON_BLOCK = CanonConstraintSchema.parse({
  id: "test.block",
  version: "0.1",
  description: "Block forbidden phrase",
  applies_to: ["A", "B", "C", "D"],
  enforcement: "block",
  detectors: [
    { kind: "phrase_list", phrases: ["forbidden phrase"], case_sensitive: false },
  ],
  examples: { allow: ["safe"], block: ["forbidden phrase"] },
});

const CANON_REVIEW = CanonConstraintSchema.parse({
  id: "determinism.language",
  version: "0.1",
  description: "Avoid deterministic language",
  applies_to: ["A", "B", "C", "D"],
  enforcement: "review",
  detectors: [{ kind: "regex", pattern: "\\bwill happen\\b", flags: "i" }],
  examples: { allow: ["could happen"], block: ["this will happen"] },
});

describe("interpreter harness", () => {
  it("is deterministic for identical inputs", () => {
    const out1 = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [BASE_COMBINATION_RULE],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });
    const out2 = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [BASE_COMBINATION_RULE],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });
    expect(out1).toStrictEqual(out2);
  });

  it("hard-blocks on canon violation", () => {
    const violatingRule: CombinationRule = {
      ...BASE_COMBINATION_RULE,
      id: "rule.forbidden",
      version: "0.1",
      outputs: {
        ...BASE_COMBINATION_RULE.outputs,
        signals: ["forbidden phrase"],
      },
    };

    const result = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [violatingRule],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_BLOCK],
    });

    expect(result.hard_blocked).toBe(true);
    const blockCheck = result.canon_checks.find(
      (c) => c.constraint_id === CANON_BLOCK.id
    );
    expect(blockCheck?.status).toBe("fail");
  });

  it("ensures trace completeness for tags", () => {
    const result = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [BASE_COMBINATION_RULE],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });

    const ruleIds = new Set(result.trace.applied_rules.map((r) => r.id));
    const tags = [
      ...result.layers.D.signals,
      ...result.layers.D.counter_signals,
      ...result.layers.A.highlights,
      ...result.layers.B.risks,
      ...result.layers.B.mitigations,
      ...result.layers.C.opportunities,
      ...result.layers.C.actions,
    ];

    expect(ruleIds.size).toBeGreaterThan(0);
    expect(tags.length).toBeGreaterThan(0);
    tags.forEach((tag) => {
      expect(tag.length).toBeLessThanOrEqual(64);
      expect(ruleIds.has(BASE_COMBINATION_RULE.id)).toBe(true);
    });
  });

  it("enforces schema and rejects invalid strings", () => {
    const badRule: CombinationRule = {
      ...BASE_COMBINATION_RULE,
      id: "rule.bad",
      outputs: {
        ...BASE_COMBINATION_RULE.outputs,
        signals: ["line\nbreak"],
      },
    };
    expect(() =>
      runInterpreter({
        facts: MOCK_FACTS,
        combinationRules: [badRule],
        weightingPolicy: WEIGHTING_POLICY,
        canon: [CANON_REVIEW],
      })
    ).toThrow();
  });
});

