/**
 * Shared phrase patterns for validation and instrumentation.
 * 
 * These patterns are used by both validators and the Phase G run summary collector
 * to ensure consistency in detection logic.
 */

/**
 * Soft permission patterns that satisfy behavioral affordance requirements for closing segments.
 * These patterns are recognized as valid affordances without triggering advice/prediction blocks.
 */
export const SOFT_PERMISSION_PATTERNS = [
  /you might let/i,
  /you might notice/i,
  /it'?s okay to/i,
  /it is okay to/i,
  /you don'?t have to/i,
  /there'?s room to/i,
  /nothing needs to/i,
  /you can leave/i,
  /you can let/i,
  /you can notice/i,
  /you can pause/i,
  /you can rest/i,
  /you can stop/i,
  /it'?s fine to/i,
  /it is fine to/i,
  /not today/i,
  /this isn'?t urgent/i,
  /take the space/i,
];

/**
 * Future certainty patterns that indicate prediction language in closing segments.
 * These patterns are flagged as violations.
 */
export const CLOSING_PREDICTION_PATTERNS = [
  /\bwill\b/i,
  /\bgoing to\b/i,
  /\bsoon\b/i,
  /\bin the coming days\b/i,
  /\btomorrow\b/i,
  /\bnext\b/i,
];

/**
 * Banned phrase: "meaning over minutiae"
 * This phrase is hard-banned across all segments.
 */
export const BANNED_PHRASE_MEANING_OVER_MINUTIAE = "meaning over minutiae";

/**
 * Check if text contains the banned phrase "meaning over minutiae" (case-insensitive).
 */
export function hasBannedPhraseMeaningOverMinutiae(text: string): boolean {
  return text.toLowerCase().includes(BANNED_PHRASE_MEANING_OVER_MINUTIAE.toLowerCase());
}

/**
 * Check if text contains any closing prediction language patterns.
 * Only use this for closing segments.
 */
export function hasClosingPredictionLanguage(text: string): boolean {
  return CLOSING_PREDICTION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Extract all matching prediction terms from text.
 * Returns an array of matched terms (normalized to lowercase).
 */
export function extractClosingPredictionTerms(text: string): string[] {
  const matches: string[] = [];
  for (const pattern of CLOSING_PREDICTION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const found = text.match(regex);
    if (found) {
      matches.push(found[0].toLowerCase());
    }
  }
  return [...new Set(matches)]; // deduplicate
}

/**
 * Check if text contains any soft permission patterns.
 * Only use this for closing segments.
 */
export function hasSoftPermission(text: string): boolean {
  return SOFT_PERMISSION_PATTERNS.some((pattern) => pattern.test(text));
}
