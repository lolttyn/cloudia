import { InterpreterFactsInput, CombinationResult } from "./applyCombinationRules.js";

export type WeightingRule = {
  id: string;
  priority: number;
  when?: {
    salience?: string;
  };
  weights: {
    time_horizon: "short" | "medium" | "long";
    psychological_weight: number;
    behavioral_weight: number;
    speakability: "must_say" | "can_say" | "avoid";
  };
  fallback_outputs?: Partial<CombinationResult["aggregate"]>;
};

export type WeightingPolicy = {
  rules: WeightingRule[];
};

export type WeightingResult = {
  weights: WeightingRule["weights"];
  fallback_outputs: Partial<CombinationResult["aggregate"]>;
  trace: {
    weights: Array<{
      id: string;
      priority: number;
      applied: boolean;
    }>;
  };
  speakabilityMap: Record<string, WeightingRule["weights"]["speakability"]>;
};

export function applyWeighting(
  facts: InterpreterFactsInput,
  combo: CombinationResult,
  policy: WeightingPolicy
): WeightingResult {
  const matches = policy.rules
    .filter((rule) => {
      if (!rule.when) return true;
      if (rule.when.salience) {
        return facts.transits.some((t) => t.salience === rule.when!.salience);
      }
      return true;
    })
    .sort((a, b) => b.priority - a.priority);

  const primary = matches[0];
  const weights =
    primary?.weights ?? {
      time_horizon: "medium",
      psychological_weight: 0.5,
      behavioral_weight: 0.5,
      speakability: "can_say",
    };

  const fallback_outputs = primary?.fallback_outputs ?? {};

  const speakabilityMap: Record<string, WeightingRule["weights"]["speakability"]> =
    {};
  combo.matchedRules.forEach((rule) => {
    const best = policy.rules
      .filter((pol) => {
        if (!pol.when?.salience) return true;
        return pol.when.salience === rule.when.salience;
      })
      .sort((a, b) => b.priority - a.priority)[0];
    speakabilityMap[rule.id] = best?.weights.speakability ?? "can_say";
  });

  const trace = {
    weights: policy.rules.map((rule) => ({
      id: rule.id,
      priority: rule.priority,
      applied: primary ? primary.id === rule.id : false,
    })),
  };

  return { weights, fallback_outputs, trace, speakabilityMap };
}

