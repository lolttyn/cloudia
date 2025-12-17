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
      orb_deg: 0.6,
      duration_days: 2,
      retrograde: false,
    },
    {
      planet: "venus",
      sign: "capricorn",
      salience: "secondary",
      orb_deg: 2.1,
      duration_days: 7,
      retrograde: false,
    },
    {
      planet: "saturn",
      sign: "pisces",
      salience: "background",
      orb_deg: 5.5,
      duration_days: 90,
      retrograde: true,
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

const SECONDARY_RULE: CombinationRule = {
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
};

const BACKGROUND_RULE: CombinationRule = {
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
      combinationRules: [
        BASE_COMBINATION_RULE,
        SECONDARY_RULE,
        BACKGROUND_RULE,
      ],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });
    const out2 = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [
        BASE_COMBINATION_RULE,
        SECONDARY_RULE,
        BACKGROUND_RULE,
      ],
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
      combinationRules: [violatingRule, SECONDARY_RULE],
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
      combinationRules: [
        BASE_COMBINATION_RULE,
        SECONDARY_RULE,
        BACKGROUND_RULE,
      ],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });

    const ruleIds = new Set(result.trace.applied_rules.map((r) => r.id));
    expect(ruleIds.size).toBeGreaterThanOrEqual(3);
    const suppressedSignals =
      (result as any).suppressed_tags?.filter((t: any) => t.field === "signals") ??
      [];
    // Background rule should be suppressed by speakability (avoid).
    const backgroundSuppressed = suppressedSignals.some(
      (t: any) => t.ruleId === BACKGROUND_RULE.id
    );
    expect(backgroundSuppressed).toBe(true);
    // Primary signal should survive.
    expect(result.layers.D.signals).toContain("core-theme-mars-cancer");
    // Secondary can be crowded out if over limit; ensure at most 3 signals.
    expect(result.layers.D.signals.length).toBeLessThanOrEqual(3);
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

  it("suppresses lower-priority duplicates but traces them", () => {
    const duplicateRule: CombinationRule = {
      ...SECONDARY_RULE,
      id: "rule.secondary.duplicate",
      version: "0.1",
      priority: 4,
      outputs: {
        ...SECONDARY_RULE.outputs,
        signals: ["core-theme-mars-cancer"], // duplicate tag to be suppressed
      },
    };

    const result = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [
        BASE_COMBINATION_RULE,
        SECONDARY_RULE,
        duplicateRule,
      ],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    });

    // Tag should appear from higher priority rule, duplicate suppressed.
    expect(result.layers.D.signals).toContain("core-theme-mars-cancer");
    const suppressed = (result as any).suppressed_tags || [];
    const dupSuppressed = suppressed.find(
      (t: any) =>
        t.ruleId === "rule.secondary.duplicate" &&
        t.suppressed_reason === "lower_priority_duplicate"
    );
    expect(dupSuppressed).toBeTruthy();
  });

  it("computes confidence degradation deterministically", () => {
    const result = runInterpreter({
      facts: MOCK_FACTS,
      combinationRules: [
        BASE_COMBINATION_RULE,
        SECONDARY_RULE,
        BACKGROUND_RULE,
      ],
      weightingPolicy: WEIGHTING_POLICY,
      canon: [CANON_REVIEW],
    }) as any;

    // Primary + secondary signals present -> medium
    expect(result.confidence_level).toBe("medium");
  });
});

