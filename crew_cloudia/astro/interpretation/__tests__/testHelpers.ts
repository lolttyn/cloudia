/**
 * Phase 5.2 — Test-only helper for canonical meaning path
 * 
 * This helper runs the full canonical path (loader → adapter → derive → transform)
 * and returns InterpretiveFrame for test comparison purposes.
 * 
 * DO NOT use in production until parity is proven.
 */

import { loadInterpretationInputs } from "../loadInterpretationInputs.js";
import { adaptToInterpreterInput } from "../adaptToInterpreterInput.js";
import { deriveDailyInterpretation } from "../deriveDailyInterpretation.js";
import { transformToInterpretiveFrame } from "../transformToInterpretiveFrame.js";
import type { InterpretiveFrame } from "../../../interpretation/schema/InterpretiveFrame.js";

/**
 * Run canonical meaning path and return InterpretiveFrame
 * 
 * This is a test-only helper that exercises the full new path:
 * 1. Load canonical Layer 0/1 inputs
 * 2. Adapt to interpreter input shape
 * 3. Derive DailyInterpretation (canonical meaning)
 * 4. Transform to InterpretiveFrame (downstream compatibility)
 * 
 * @param date - YYYY-MM-DD
 * @returns InterpretiveFrame from canonical path
 */
export async function runCanonicalMeaningToFrameForTest(
  date: string
): Promise<InterpretiveFrame> {
  // Step 1: Load canonical inputs
  const inputs = await loadInterpretationInputs(date, {
    semantics: "require",
  });

  // Step 2: Adapt to interpreter input shape (for reference, not used in derive)
  // Note: deriveDailyInterpretation takes inputs directly, not the adapted facts
  const _interpreterFacts = adaptToInterpreterInput(inputs);

  // Step 3: Derive canonical meaning
  const dailyInterpretation = deriveDailyInterpretation(inputs);

  // Step 4: Transform to InterpretiveFrame
  const frame = transformToInterpretiveFrame(dailyInterpretation);

  return frame;
}

