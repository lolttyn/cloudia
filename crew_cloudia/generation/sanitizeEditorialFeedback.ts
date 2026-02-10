/**
 * Sanitize editorial feedback before injecting into LLM prompts.
 * - Enforces max length (1000 chars, matches DB constraint).
 * - Strips text that looks like system/assistant/user role markers to reduce prompt injection risk.
 */

const MAX_LENGTH = 1000;

/** Patterns that look like chat role or instruction markers (case-insensitive, line-start or after newline) */
const ROLE_LINE_PATTERNS = [
  /^\s*System\s*:/im,
  /^\s*Assistant\s*:/im,
  /^\s*User\s*:/im,
  /^\s*Human\s*:/im,
  /^\s*Bot\s*:/im,
  /^\s*\[System\]/im,
  /^\s*\[Assistant\]/im,
  /^\s*\[User\]/im,
  /^\s*<\|[^|]+\|>/im,  // tokenizer-style markers
  /^\s*###\s*System/im,
  /^\s*###\s*Assistant/im,
  /^\s*###\s*User/im,
  /^\s*###\s*Human/im,
];

/**
 * Remove lines that look like role/instruction markers (strip entire line).
 */
function stripRoleLikeLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    return !ROLE_LINE_PATTERNS.some((re) => re.test(line));
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sanitize editorial feedback for safe inclusion in LLM prompts.
 * - Truncates to MAX_LENGTH (1000) characters.
 * - Strips lines that look like system/assistant/user markers.
 *
 * @param feedback - Raw feedback from the user (e.g. from regeneration_requests.feedback)
 * @returns Sanitized string, safe to embed in a prompt
 */
export function sanitizeEditorialFeedback(feedback: string): string {
  if (typeof feedback !== "string") return "";
  let out = stripRoleLikeLines(feedback);
  if (out.length > MAX_LENGTH) {
    out = out.slice(0, MAX_LENGTH);
  }
  return out.trim();
}
