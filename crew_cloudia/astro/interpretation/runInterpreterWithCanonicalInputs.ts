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
import type { CombinationRule } from "./interpreter/applyCombinationRules.js";
import type { WeightingPolicy } from "./interpreter/applyWeighting.js";

/**
 * Load combination rules (placeholder - will be replaced with canonical source in future)
 * For Phase 5.2, returns empty array. Rules should be loaded from canonical source.
 */
function loadCombinationRules(): CombinationRule[] {
  // TODO: Load from canonical source (e.g., rule registry or config)
  // For now, return empty - interpreter will still run but produce empty outputs
  return [];
}

/**
 * Load weighting policy (placeholder - will be replaced with canonical source in future)
 * For Phase 5.2, returns default policy.
 */
function loadWeightingPolicy(): WeightingPolicy {
  // TODO: Load from canonical source
  // For now, return default policy
  return {
    rules: [
      {
        id: "weight.default",
        priority: 1,
        weights: {
          time_horizon: "medium",
          psychological_weight: 0.5,
          behavioral_weight: 0.5,
          speakability: "can_say",
        },
      },
    ],
  };
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

