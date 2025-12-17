import { DailyInterpretationSchema } from "../schema/ikb.schemas.js";
import {
  applyCombinationRules,
  CombinationRule,
  MockFacts,
  AggregatedOutputs,
} from "./applyCombinationRules.js";
import { applyWeighting, WeightingPolicy, WeightingResult } from "./applyWeighting.js";
import { evaluateCanon } from "./evaluateCanon.js";
import { CanonConstraint } from "../canon/canon.schemas.js";

export type InterpreterInput = {
  facts: MockFacts;
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

  const aggregate = mergeOutputs(comboResult.aggregate, weightingResult);

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

