import { DailyInterpretationSchema } from "../schema/ikb.schemas.js";
import {
  applyCombinationRules,
  CombinationRule,
  InterpreterFactsInput,
  AggregatedOutputs,
  TagRecord,
  TagField,
  EMPTY_AGGREGATE,
} from "./applyCombinationRules.js";
import { applyWeighting, WeightingPolicy, WeightingResult } from "./applyWeighting.js";
import { evaluateCanon } from "./evaluateCanon.js";
import { CanonConstraint } from "../canon/canon.schemas.js";

export type InterpreterInput = {
  facts: InterpreterFactsInput;
  combinationRules: CombinationRule[];
  weightingPolicy: WeightingPolicy;
  canon: CanonConstraint[];
};

export function runInterpreter(input: InterpreterInput) {
  const comboResult = applyCombinationRules(input.facts, input.combinationRules);
  const weightingResult = applyWeighting(
    input.facts,
    comboResult,
    input.weightingPolicy
  );

  const { kept, suppressed, outputs } = applySpeakabilityAndLimits(
    comboResult.activeTags,
    weightingResult,
    3
  );
  const suppressedAll = [...comboResult.suppressedTags, ...suppressed];
  // Incorporate fallback outputs if any category is empty.
  const aggregate = mergeOutputs(outputs, weightingResult);

  const daily = DailyInterpretationSchema.parse({
    date: input.facts.date,
    layers: {
      A: {
        layer: "A",
        focus: aggregate.focus,
        interpretation: aggregate.interpretation,
        rationale: aggregate.rationale,
        highlights: aggregate.highlights,
        trace: { applied_rules: comboResult.trace.applied_rules },
      },
      B: {
        layer: "B",
        focus: aggregate.focus,
        interpretation: aggregate.interpretation,
        rationale: aggregate.rationale,
        risks: aggregate.risks,
        mitigations: aggregate.mitigations,
        trace: { applied_rules: comboResult.trace.applied_rules },
      },
      C: {
        layer: "C",
        focus: aggregate.focus,
        interpretation: aggregate.interpretation,
        rationale: aggregate.rationale,
        opportunities: aggregate.opportunities,
        actions: aggregate.actions,
        trace: { applied_rules: comboResult.trace.applied_rules },
      },
      D: {
        layer: "D",
        focus: aggregate.focus,
        interpretation: aggregate.interpretation,
        rationale: aggregate.rationale,
        signals: aggregate.signals.length
          ? aggregate.signals
          : aggregate.core_theme_tags,
        counter_signals: aggregate.counter_signals.length
          ? aggregate.counter_signals
          : aggregate.recommended_response_tags,
        trace: { applied_rules: comboResult.trace.applied_rules },
      },
    },
    trace: {
      applied_rules: comboResult.trace.applied_rules,
    },
  });

  const canonResult = evaluateCanon(daily, input.canon);

  return {
    ...daily,
    hard_blocked: canonResult.hard_blocked,
    canon_checks: canonResult.canon_checks,
    suppressed_tags: suppressedAll,
    confidence_level: computeConfidence(kept, daily.layers.D.signals),
  };
}

function mergeOutputs(
  outputs: AggregatedOutputs,
  weighting: WeightingResult
) {
  const merged: AggregatedOutputs = structuredClone(outputs);

  if (merged.focus.length === 0 && weighting.fallback_outputs.focus) {
    merged.focus = weighting.fallback_outputs.focus;
  }
  if (
    merged.interpretation.length === 0 &&
    weighting.fallback_outputs.interpretation
  ) {
    merged.interpretation = weighting.fallback_outputs.interpretation;
  }
  if (merged.rationale.length === 0 && weighting.fallback_outputs.rationale) {
    merged.rationale = weighting.fallback_outputs.rationale;
  }
  if (merged.highlights.length === 0 && weighting.fallback_outputs.highlights) {
    merged.highlights = weighting.fallback_outputs.highlights;
  }
  if (merged.risks.length === 0 && weighting.fallback_outputs.risks) {
    merged.risks = weighting.fallback_outputs.risks;
  }
  if (
    merged.mitigations.length === 0 &&
    weighting.fallback_outputs.mitigations
  ) {
    merged.mitigations = weighting.fallback_outputs.mitigations;
  }
  if (
    merged.opportunities.length === 0 &&
    weighting.fallback_outputs.opportunities
  ) {
    merged.opportunities = weighting.fallback_outputs.opportunities;
  }
  if (merged.actions.length === 0 && weighting.fallback_outputs.actions) {
    merged.actions = weighting.fallback_outputs.actions;
  }
  if (merged.signals.length === 0 && weighting.fallback_outputs.signals) {
    merged.signals = weighting.fallback_outputs.signals;
  }
  if (
    merged.counter_signals.length === 0 &&
    weighting.fallback_outputs.counter_signals
  ) {
    merged.counter_signals = weighting.fallback_outputs.counter_signals;
  }
  if (
    merged.core_theme_tags.length === 0 &&
    weighting.fallback_outputs.core_theme_tags
  ) {
    merged.core_theme_tags = weighting.fallback_outputs.core_theme_tags;
  }
  if (
    merged.emotional_tone_tags.length === 0 &&
    weighting.fallback_outputs.emotional_tone_tags
  ) {
    merged.emotional_tone_tags = weighting.fallback_outputs.emotional_tone_tags;
  }
  if (
    merged.likely_experience_tags.length === 0 &&
    weighting.fallback_outputs.likely_experience_tags
  ) {
    merged.likely_experience_tags =
      weighting.fallback_outputs.likely_experience_tags;
  }
  if (
    merged.recommended_response_tags.length === 0 &&
    weighting.fallback_outputs.recommended_response_tags
  ) {
    merged.recommended_response_tags =
      weighting.fallback_outputs.recommended_response_tags;
  }

  return merged;
}

function applySpeakabilityAndLimits(
  tags: TagRecord[],
  weighting: WeightingResult,
  limitPerField: number
) {
  const suppressed: TagRecord[] = [];
  const kept: TagRecord[] = [];

  // Attach speakability from weighting per rule.
  const tagged = tags.map((tag) => ({
    ...tag,
    speakability: weighting.speakabilityMap[tag.ruleId] ?? "can_say",
  }));

  const byField = new Map<TagField, TagRecord[]>();
  for (const tag of tagged) {
    const list = byField.get(tag.field) ?? [];
    list.push(tag);
    byField.set(tag.field, list);
  }

  const outputs: AggregatedOutputs = structuredClone(
    EMPTY_AGGREGATE
  );

  for (const [field, list] of byField.entries()) {
    const sorted = list.sort((a, b) => b.priority - a.priority);
    const must = sorted.filter((t) => t.speakability === "must_say");
    const can = sorted.filter((t) => t.speakability === "can_say");
    const avoid = sorted.filter((t) => t.speakability === "avoid");

    // Avoid: always suppressed but traced.
    avoid.forEach((tag) =>
      suppressed.push({ ...tag, suppressed_reason: "avoid" })
    );

    // Must-say: always keep.
    must.forEach((tag) => {
      kept.push(tag);
      (outputs as Record<string, string[]>)[field].push(tag.value);
    });

    // Can-say: include up to limitPerField after must-say.
    const remainingSlots = Math.max(0, limitPerField - must.length);
    can.forEach((tag, idx) => {
      if (idx < remainingSlots) {
        kept.push(tag);
        (outputs as Record<string, string[]>)[field].push(tag.value);
      } else {
        suppressed.push({ ...tag, suppressed_reason: "crowded_out" });
      }
    });
  }

  return { kept, suppressed, outputs };
}

function computeConfidence(kept: TagRecord[], signals: string[]) {
  let level: "high" | "medium" | "low" = "high";

  const toneTags = kept.filter((t) => t.field === "emotional_tone_tags");
  const signalTags = kept.filter((t) => t.field === "signals");
  const salienceCounts = signalTags.reduce<Record<string, number>>((acc, t) => {
    if (t.salience) acc[t.salience] = (acc[t.salience] || 0) + 1;
    return acc;
  }, {});

  const distinctTones = new Set(toneTags.map((t) => t.value));
  const hasPrimary = (salienceCounts["primary"] ?? 0) > 0;
  const hasSecondary = (salienceCounts["secondary"] ?? 0) > 0;
  const backgroundCount = salienceCounts["background"] ?? 0;

  if (distinctTones.size > 1 || (hasPrimary && hasSecondary)) {
    level = "medium";
  }

  if (
    backgroundCount > (salienceCounts["primary"] ?? 0) + (salienceCounts["secondary"] ?? 0) ||
    signals.length > 3
  ) {
    level = "low";
  }

  return level;
}

