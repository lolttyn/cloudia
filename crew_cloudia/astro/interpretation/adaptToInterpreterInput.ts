/**
 * Phase 5.1 — Compatibility Adapter
 * 
 * Maps InterpretationInputs (Layer 0 + Layer 1) to the current interpreter input shape.
 * This is a pure function bridge; no behavior changes in Phase 5.1.
 * 
 * After extending DailyFacts with interpreter_transits_v1, this adapter is trivial:
 * it just passes through the pre-computed transits with no heuristics or synthesis.
 */

import { InterpretationInputs } from "./loadInterpretationInputs.js";

/**
 * InterpreterFactsInput (renamed from MockFacts)
 * 
 * The current interpreter input shape. Do not redesign this in Phase 5.1.
 */
export type InterpreterFactsInput = {
  date: string;

  // Current interpreter expects transits array
  transits: Array<{
    planet: string;
    sign: string;
    salience: string; // "primary" | "secondary" | "background"
    orb_deg: number;
    duration_days: number;
    retrograde: boolean;
  }>;

  // Keep provenance optional; don't force downstream changes yet
  _provenance?: {
    sky_state: { date: string; version?: string };
    daily_facts: { date: string; policy_version?: string };
  };
};

/**
 * Compatibility bridge: Inputs → Current Interpreter Shape
 * 
 * Pure function: no IO, no time calls, no randomness.
 * Total mapping: every field is directly copied from DailyFacts.interpreter_transits_v1.
 * 
 * @param inputs - Canonical Layer 0 + Layer 1 inputs
 * @returns InterpreterFactsInput matching current interpreter expectations
 */
export function adaptToInterpreterInput(
  inputs: InterpretationInputs
): InterpreterFactsInput {
  const { daily_facts, timestamp, meta } = inputs;

  // Trivial passthrough: interpreter_transits_v1 is already in the exact shape needed
  const transits = daily_facts.interpreter_transits_v1.map((t) => ({
    planet: t.planet,
    sign: t.sign,
    salience: t.salience,
    orb_deg: t.orb_deg,
    duration_days: t.duration_days,
    retrograde: t.retrograde,
  }));

  return {
    date: timestamp.date,
    transits,
    _provenance: {
      sky_state: {
        date: timestamp.date,
        version: meta?.sky_state_version,
      },
      daily_facts: {
        date: timestamp.date,
        policy_version: meta?.daily_facts_policy_version,
      },
    },
  };
}

