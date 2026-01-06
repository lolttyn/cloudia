/**
 * Phase 5.2 Step 1 — Production orchestrator for astro interpreter
 * 
 * Wires the canonical Layer 0/1 loader + adapter to the astro interpreter.
 * This is the production entrypoint that replaces manual MockFacts construction.
 */

import { loadInterpretationInputs } from "./loadInterpretationInputs.js";
import { adaptToInterpreterInput } from "./adaptToInterpreterInput.js";
import { runInterpreter, type InterpreterInput } from "./interpreter/runInterpreter.js";
import { CANON_V0_1 } from "./canon/canon.v0_1.js";
import { COMBINATION_RULES_V0_1 } from "./canon/combinationRules.v0_1.js";
import { WEIGHTING_POLICY_V0_1 } from "./canon/weightingPolicy.v0_1.js";
import type { CombinationRule } from "./interpreter/applyCombinationRules.js";
import type { WeightingPolicy } from "./interpreter/applyWeighting.js";

/**
 * Load combination rules from canonical source
 * 
 * @returns Canonical combination rules v0.1
 */
function loadCombinationRules(): CombinationRule[] {
  return COMBINATION_RULES_V0_1;
}

/**
 * Load weighting policy from canonical source
 * 
 * @returns Canonical weighting policy v0.1
 */
function loadWeightingPolicy(): WeightingPolicy {
  return WEIGHTING_POLICY_V0_1;
}

/**
 * Production entrypoint: Run interpreter with canonical Layer 0/1 inputs
 * 
 * @param date - YYYY-MM-DD
 * @returns DailyInterpretation (from astro interpreter)
 */
export async function runInterpreterWithCanonicalInputs(date: string) {
  // Step 1: Load canonical Layer 0 + Layer 1 inputs
  const inputs = await loadInterpretationInputs(date, {
    semantics: "require",
  });

  // Step 2: Adapt to interpreter input shape
  const interpreterFacts = adaptToInterpreterInput(inputs);

  // Step 3: Load rules and policies (placeholder for now)
  const combinationRules = loadCombinationRules();
  const weightingPolicy = loadWeightingPolicy();
  const canon = CANON_V0_1;

  // Step 4: Run interpreter
  const interpreterInput: InterpreterInput = {
    facts: interpreterFacts,
    combinationRules,
    weightingPolicy,
    canon,
  };

  return runInterpreter(interpreterInput);
}

