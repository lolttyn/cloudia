/**
 * Phase E1 — Canonical Interpreter Runner (Production Bridge)
 * 
 * Single canonical interpreter runner that:
 * 1. Calls canonical deriveDailyInterpretation() (refs-only)
 * 2. Persists DailyInterpretation to canonical storage
 * 3. Hydrates via hydrateInterpretiveFrameForProduction()
 * 4. Returns a legacy-compatible InterpretiveFrame (so downstream stays untouched)
 */

import { loadInterpretationInputs } from "./loadInterpretationInputs.js";
import { deriveDailyInterpretation } from "./deriveDailyInterpretation.js";
import { hydrateInterpretiveFrameForProduction } from "./hydrateInterpretiveFrameForProduction.js";
import { upsertDailyInterpretation } from "./persistence/upsertDailyInterpretation.js";
import type { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

/**
 * Canonical interpreter runner
 * 
 * @param input - Date string (YYYY-MM-DD)
 * @returns InterpretiveFrame (legacy-compatible, with full bundles)
 */
export async function runInterpreterCanonical(input: { date: string }): Promise<InterpretiveFrame> {
  // 1. Load canonical interpretation inputs
  const inputs = await loadInterpretationInputs(input.date, { semantics: "require" });

  // 2. Derive DailyInterpretation (refs-only)
  const dailyInterpretation = await deriveDailyInterpretation(inputs);

  // 3. Persist DailyInterpretation to canonical storage
  await upsertDailyInterpretation({
    episode_date: input.date,
    dailyInterpretation,
  });

  // 4. Hydrate to legacy-compatible InterpretiveFrame (full bundles)
  return await hydrateInterpretiveFrameForProduction(dailyInterpretation);
}

