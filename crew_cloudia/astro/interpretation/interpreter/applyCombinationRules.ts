import { z } from "zod";
import { InterpretationLayerSchema } from "../schema/ikb.schemas";

/**
 * InterpreterFactsInput (renamed from MockFacts)
 * 
 * The current interpreter input shape. This matches the shape produced by
 * adaptToInterpreterInput() from canonical Layer 1 DailyFacts.
 */
export type InterpreterFactsInput = {
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

/**
 * @deprecated Use InterpreterFactsInput instead. Kept for backward compatibility during migration.
 */
export type MockFacts = InterpreterFactsInput;

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
  activeTags: TagRecord[];
  suppressedTags: TagRecord[];
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

export type TagField = keyof AggregatedOutputs;

export type TagRecord = {
  field: TagField;
  value: string;
  ruleId: string;
  ruleVersion: string;
  priority: number;
  matched_on: string;
  salience?: string;
  suppressed_reason?: string;
};

export function applyCombinationRules(
  facts: InterpreterFactsInput,
  rules: CombinationRule[]
): CombinationResult {
  const matchedRules: CombinationRule[] = [];
  const tagRecords: TagRecord[] = [];
  const appliedTrace: CombinationResult["trace"]["applied_rules"] = [];

  for (const transit of facts.transits) {
    for (const rule of rules) {
      const matchPlanet = transit.planet === rule.when.planet;
      const matchSign = transit.sign === rule.when.sign;
      const matchSalience =
        rule.when.salience === undefined ||
        transit.salience === rule.when.salience;
      const matchRetro =
        rule.when.retrograde === undefined ||
        transit.retrograde === rule.when.retrograde;
      if (!(matchPlanet && matchSign && matchSalience && matchRetro)) continue;

      matchedRules.push(rule);
      appliedTrace.push({
        id: rule.id,
        version: rule.version,
        matched_on: `${transit.planet}:${transit.sign}:${transit.salience}`,
        priority: rule.priority,
      });

      Object.entries(rule.outputs).forEach(([key, value]) => {
        const arr = value ?? [];
        arr.forEach((item) => {
          shortTag.parse(item);
          tagRecords.push({
            field: key as TagField,
            value: item,
            ruleId: rule.id,
            ruleVersion: rule.version,
            priority: rule.priority,
            matched_on: `${transit.planet}:${transit.sign}:${transit.salience}`,
            salience: transit.salience,
          });
        });
      });
    }
  }

  // Resolve conflicts: higher-priority tags win, lower-priority duplicates are suppressed.
  const activeTags: TagRecord[] = [];
  const suppressedTags: TagRecord[] = [];
  const seenByField = new Map<TagField, Set<string>>();

  const sortedTags = tagRecords.sort((a, b) => b.priority - a.priority);
  for (const tag of sortedTags) {
    const seen = seenByField.get(tag.field) ?? new Set<string>();
    if (seen.has(tag.value)) {
      suppressedTags.push({
        ...tag,
        suppressed_reason: "lower_priority_duplicate",
      });
      continue;
    }
    seen.add(tag.value);
    seenByField.set(tag.field, seen);
    activeTags.push(tag);
  }

  const trace = {
    applied_rules: appliedTrace.sort((a, b) => b.priority - a.priority),
  };

  return { matchedRules: matchedRules.sort((a, b) => b.priority - a.priority), activeTags, suppressedTags, trace };
}

