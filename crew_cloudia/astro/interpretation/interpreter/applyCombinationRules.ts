import { z } from "zod";
import { InterpretationLayerSchema } from "../schema/ikb.schemas";

export type MockFacts = {
  date: string;
  transits: Array<{
    planet: string;
    sign: string;
    salience: string;
    orb_deg: number;
    duration_days: number;
    retrograde: boolean;
  }>;
};

const shortTag = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !/\n/.test(v))
  .refine((v) => !v.trim().endsWith("."));

export type CombinationRule = {
  id: string;
  version: string;
  priority: number;
  layer: z.infer<typeof InterpretationLayerSchema>;
  when: {
    planet: string;
    sign: string;
    salience?: string;
    retrograde?: boolean;
  };
  outputs: {
    focus: string[];
    interpretation: string[];
    rationale: string[];
    highlights?: string[];
    risks?: string[];
    mitigations?: string[];
    opportunities?: string[];
    actions?: string[];
    signals?: string[];
    counter_signals?: string[];
    core_theme_tags?: string[];
    emotional_tone_tags?: string[];
    likely_experience_tags?: string[];
    recommended_response_tags?: string[];
  };
};

export type CombinationResult = {
  matchedRules: CombinationRule[];
  aggregate: AggregatedOutputs;
  trace: {
    applied_rules: Array<{
      id: string;
      version: string;
      matched_on: string;
      priority: number;
    }>;
  };
};

export type AggregatedOutputs = Required<CombinationRule["outputs"]>;

export const EMPTY_AGGREGATE: AggregatedOutputs = {
  focus: [],
  interpretation: [],
  rationale: [],
  highlights: [],
  risks: [],
  mitigations: [],
  opportunities: [],
  actions: [],
  signals: [],
  counter_signals: [],
  core_theme_tags: [],
  emotional_tone_tags: [],
  likely_experience_tags: [],
  recommended_response_tags: [],
};

export function applyCombinationRules(
  facts: MockFacts,
  rules: CombinationRule[]
): CombinationResult {
  const matched = rules.filter((rule) =>
    facts.transits.some((transit) => {
      if (
        transit.planet !== rule.when.planet ||
        transit.sign !== rule.when.sign
      ) {
        return false;
      }
      if (
        rule.when.salience !== undefined &&
        transit.salience !== rule.when.salience
      ) {
        return false;
      }
      if (
        rule.when.retrograde !== undefined &&
        transit.retrograde !== rule.when.retrograde
      ) {
        return false;
      }
      return true;
    })
  );

  const sorted = matched.sort((a, b) => b.priority - a.priority);

  const aggregate: AggregatedOutputs = structuredClone(EMPTY_AGGREGATE);

  for (const rule of sorted) {
    Object.entries(rule.outputs).forEach(([key, value]) => {
      const arr = value ?? [];
      arr.forEach((item) => shortTag.parse(item));
      (aggregate as Record<string, string[]>)[key] = [
        ...(aggregate as Record<string, string[]>)[key],
        ...arr,
      ];
    });
  }

  const trace = {
    applied_rules: sorted.map((rule) => ({
      id: rule.id,
      version: rule.version,
      matched_on: `${rule.when.planet}:${rule.when.sign}`,
      priority: rule.priority,
    })),
  };

  return { matchedRules: sorted, aggregate, trace };
}

