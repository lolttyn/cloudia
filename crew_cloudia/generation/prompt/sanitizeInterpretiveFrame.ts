import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

/**
 * Sanitizes an interpretive frame for LLM prompts by removing fields that should not be shown to the model.
 * 
 * Specifically removes:
 * - `dominant_contrast_axis.statement` (banned phrases like "meaning over minutiae" are in the statement)
 * 
 * Keeps:
 * - `dominant_contrast_axis.primary` and `.counter` (the model should use these to express the contrast naturally)
 * - All other fields intact
 */
export function sanitizeInterpretiveFrameForPrompt(
  frame: InterpretiveFrame | undefined | null
): any {
  if (!frame) {
    return frame;
  }

  // Deep clone to avoid mutating the original
  const sanitized = JSON.parse(JSON.stringify(frame));

  // Remove statement from dominant_contrast_axis - model should use primary/counter to express contrast naturally
  if (sanitized.dominant_contrast_axis) {
    sanitized.dominant_contrast_axis = {
      primary: sanitized.dominant_contrast_axis.primary,
      counter: sanitized.dominant_contrast_axis.counter,
    };
  }

  return sanitized;
}
