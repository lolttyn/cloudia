import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";

const ADVICE_PATTERNS = [/you should/i, /\bshould\b/i, /\bneed to\b/i, /\bmust\b/i, /\btry to\b/i];
const PREDICTION_PATTERNS = [/\bwill\b/i, /\bgoing to\b/i, /\bsoon\b/i];
const REFLECTIVE_PATTERNS = [/\bfeel\b/i, /\bnotice\b/i, /\bsense\b/i, /\bbreath/i, /\bholding\b/i, /\bsitting with\b/i, /\bcaring\b/i, /\bcarrying\b/i];
const LISTENER_PATTERN = /\b(you|your|this moment)\b/i;

/**
 * Normalizes strings for comparison (same normalization as intro greeting).
 * Handles unicode variations, smart quotes, line endings, and whitespace.
 */
function normalizeForScan(s: string): string {
  return (s ?? "")
    .normalize("NFKC") // Normalize unicode (combines compatible characters)
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\u00A0/g, " ") // Replace non-breaking spaces with regular spaces
    .replace(/[''`]/g, "'") // Replace all apostrophe variants (curly, smart, backtick) with straight
    .replace(/[""]/g, '"') // Replace smart quotes with straight quotes (defensive)
    .trim();
}

/**
 * Strips meta/pacing content (parentheticals, brackets, JSON-style notes) from text.
 */
function stripMeta(s: string): string {
  return s
    .replace(/\([^)]*\)/g, "") // Strip parentheticals
    .replace(/\[[^\]]*\]/g, "") // Strip brackets (pacing notes, asides)
    .replace(/\{[^}]*\}/g, ""); // Strip JSON-style notes
}

/**
 * Extracts content before the sign-off by normalizing both strings and finding the last occurrence.
 * Returns normalized prefix for scanning purposes.
 */
function contentBeforeSignOff(script: string, signOff: string): string {
  const normalizedScript = normalizeForScan(script);
  const normalizedSignOff = normalizeForScan(signOff);

  // Use lastIndexOf to find the last occurrence (safer if sign-off appears multiple times)
  const idx = normalizedScript.lastIndexOf(normalizedSignOff);
  if (idx === -1) {
    // Sign-off not found - return normalized script as fallback (don't accidentally drop content)
    return normalizedScript;
  }

  // Return normalized prefix (content before sign-off)
  return normalizedScript.slice(0, idx);
}

/**
 * Finds the first matching pattern in text and returns it with context window.
 * Used for debugging prediction language violations.
 */
function firstMatchWithContext(text: string, patterns: RegExp[]): { pattern: string; match: string; context: string } | null {
  for (const re of patterns) {
    // Reset regex lastIndex to ensure fresh search
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + (m[0]?.length ?? 0) + 40);
      return {
        pattern: re.toString(),
        match: m[0],
        context: text.slice(start, end).replace(/\n/g, " ").trim(),
      };
    }
  }
  return null;
}
const PHASE_POLARITY_CUES: Record<string, string[]> = {
  building: ["gather", "forming", "ready", "opening", "anticipation", "noticing"],
  peak: ["alive", "immediate", "now", "intense", "charged", "present"],
  releasing: ["exhale", "letting go", "soften", "ease", "settling", "unwind", "unclench"],
  aftershock: ["echo", "residue", "afterglow", "linger", "trace", "quiet"],
};

export function evaluateClosingWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  episode_date: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
  scaffold: string;
  signoff: string;
}): EditorFeedback {
  const notes: string[] = [];
  const rewrite_instructions: string[] = [];
  const blocking_reasons: string[] = [];
  const script = params.draft_script.trim();

  const axis = params.interpretive_frame.dominant_contrast_axis.statement;
  const timingNote = params.interpretive_frame.timing?.notes ?? params.interpretive_frame.timing?.state;
  const temporalPhase = params.interpretive_frame.temporal_phase.toLowerCase();
  const { scaffold, signoff } = params;

  // Use normalized matching for reliable detection (handles whitespace/unicode variations)
  const normalizedScript = normalizeForScan(script);
  const normalizedScaffold = normalizeForScan(scaffold);
  const normalizedSignoff = normalizeForScan(signoff);
  const hasScaffold = normalizedScript.includes(normalizedScaffold);
  const hasSignoff = normalizedScript.includes(normalizedSignoff);

  // Phase D: Semantic check for scaffold/signoff (not verbatim requirement)
  // The closing must establish closure and integration, but can do so naturally
  if (!hasScaffold) {
    // Downgrade to warning - scaffold structure is flexible
    notes.push("Closing should establish closure or integration, but can express it naturally.");
    // Do NOT add to blocking_reasons - this is now a soft requirement
  }

  if (!hasSignoff) {
    // Downgrade to warning - signoff can be natural
    notes.push("Closing should end with a natural sign-off, but wording is flexible.");
    // Do NOT add to blocking_reasons - this is now a soft requirement
  }

  // Extract the middle micro-reflection content
  // Use normalized positions to find boundaries, but extract from original script to preserve exact text
  // (this ensures sentence splitting and other checks work on actual model output)
  let middle: string;
  if (hasScaffold && hasSignoff) {
    // Both scaffold and sign-off found - find positions in normalized space, extract from original
    const scaffoldPos = normalizedScript.indexOf(normalizedScaffold);
    const signoffPos = normalizedScript.lastIndexOf(normalizedSignoff);
    if (scaffoldPos !== -1 && signoffPos !== -1 && signoffPos > scaffoldPos) {
      // Map normalized positions to original script (approximate: use same positions)
      // For reliability, extract from normalized and use that (checks are tolerant of normalization differences)
      middle = normalizedScript.slice(scaffoldPos + normalizedScaffold.length, signoffPos).trim();
    } else {
      // Fallback: try simple replace on original
      middle = script.replace(scaffold, "").replace(signoff, "").trim();
    }
  } else if (hasScaffold) {
    // Scaffold found but sign-off not found - remove scaffold only
    const scaffoldPos = normalizedScript.indexOf(normalizedScaffold);
    if (scaffoldPos !== -1) {
      middle = normalizedScript.slice(scaffoldPos + normalizedScaffold.length).trim();
    } else {
      middle = script.replace(scaffold, "").trim();
    }
  } else if (hasSignoff) {
    // Sign-off found but scaffold not found - use contentBeforeSignOff (handles normalization)
    middle = contentBeforeSignOff(script, signoff).trim();
  } else {
    // Neither found - use original script as-is (fallback)
    middle = script.replace(scaffold, "").replace(signoff, "").trim();
  }

  const middleLower = middle.toLowerCase();

  const sentences = middle
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Phase D: Relax expressive window length (1-3 sentences allowed)
  if (sentences.length < 1 || sentences.length > 3) {
    notes.push(`Closing should contain 1-3 reflective sentences (found ${sentences.length}).`);
    // Block if too long (compression needed) or completely missing
    if (sentences.length === 0) {
      blocking_reasons.push("closing:expressive_window_length");
      rewrite_instructions.push("Add at least one reflective sentence between scaffold and sign-off.");
    } else if (sentences.length > 3) {
      blocking_reasons.push("closing:expressive_window_length");
      rewrite_instructions.push(`Reduce this closing to no more than 3 sentences total. Preserve tone; remove excess elaboration. Current: ${sentences.length} sentences.`);
    }
  }

  if (!LISTENER_PATTERN.test(middleLower)) {
    const msg = "Closing should speak to the listener directly (e.g., 'you', 'your', or 'this moment').";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  if (!REFLECTIVE_PATTERNS.some((re) => re.test(middle))) {
    const msg = "Closing lines should feel reflective/experiential, not informational or directive.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  const phaseCues = PHASE_POLARITY_CUES[temporalPhase] ?? [];
  if (phaseCues.length > 0 && !phaseCues.some((cue) => middleLower.includes(cue))) {
    const msg =
      "Closing should match the temporal phase polarity (tone cues for building/peak/releasing/aftershock) without naming the phase.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  if (
    (params.interpretive_frame.temporal_phase === "releasing" ||
      params.interpretive_frame.temporal_phase === "aftershock") &&
    /\b(push|accelerate|escalate|charge ahead)\b/i.test(middle)
  ) {
    notes.push("Closing tone should not escalate when energy is releasing/aftershock.");
    blocking_reasons.push("closing:tone_mismatch_phase");
    rewrite_instructions.push("Soften the tone to match releasing/aftershock; avoid escalation verbs.");
  }

  // Phase D: Semantic check for axis (not verbatim ban)
  // The closing should not restate the axis as a named contrast, but can express the tension naturally
  if (axis && middleLower.includes(axis.toLowerCase())) {
    // Check if it's being used as a named contrast vs. natural expression
    const axisWords = axis.toLowerCase().split(/\s+/);
    const hasAxisAsConcept = axisWords.every(word => middleLower.includes(word));
    if (hasAxisAsConcept && axisWords.length > 2) {
      // Likely using the full phrase as a concept - warn but don't block
      notes.push("Closing should express the day's tension naturally, not as a named contrast or theme.");
      // Do NOT add to blocking_reasons - allow natural expression
    }
  }

  if (middleLower.includes(temporalPhase)) {
    const msg = "Do not restate the temporal phase label in the closing; it's already in the scaffold.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  // Phase D: Narrow advice detection to only explicit imperatives/directives
  // Soft permission patterns ("you might let", "it's okay to") must pass
  // Observational language ("you might notice", "it can feel like") must pass
  const explicitAdvicePatterns = [
    /\byou should\b/i,
    /\btry to\b/i,
    /\bmake sure to\b/i,
    /\bremember to\b/i,
    /\btake this as\b/i,
    /\bdo this now\b/i,
  ];
  
  const hasExplicitAdvice = explicitAdvicePatterns.some((re) => re.test(middle));
  if (hasExplicitAdvice) {
    notes.push("Avoid explicit advice or directives; keep the tone observational.");
    blocking_reasons.push("closing:advice_language");
    rewrite_instructions.push("Remove directive language (e.g., 'you should', 'try to', 'make sure to'). Use soft permission or observational reflection instead.");
  }

  // Phase D: Narrow prediction detection to only future certainty
  // Do not flag "might", "can", "today holds", "this moment allows"
  // CRITICAL: Exclude the sign-off from prediction checks - it contains required text like "tomorrow" and "We'll"
  // Always use contentBeforeSignOff for prediction scan (even if hasSignoff is false, defensive check catches format mismatches)
  // This ensures sign-off is excluded even if whitespace/unicode variations caused the hasSignoff check to fail
  const contentPrefix = contentBeforeSignOff(script, signoff); // Returns normalized content before sign-off
  
  // CRITICAL: Strip meta/pacing content (parentheticals, brackets, JSON-style notes) before prediction scan
  // Parentheticals like "(Sun-Moon trine next...)" and brackets like "[pacing note: next transit]" 
  // contain meta information and shouldn't trigger prediction violations
  const contentForPredictionScan = stripMeta(contentPrefix).trim();
  
  // Future certainty patterns - narrowed to actual prediction language, not sequencing
  // NOTE: Removed /\bnext\b/i because it flags false positives like "next step" (not predictive)
  // Only flag "next" when it appears in clearly future-leaning phrases
  const futureCertaintyPatterns = [
    /\bwill\b/i,
    /\bgoing to\b/i,
    /\bsoon\b/i,
    /\bin the coming days\b/i,
    /\btomorrow\b/i,
    /\bwhat'?s coming next\b/i, // "what's coming next" - clearly predictive
    /\bcoming next\b/i, // "coming next" - future framing
    /\bnext (week|month|year|time)\b/i, // "next week/month/year/time" - time references
    /\bin the next (day|days|week|weeks|month|months)\b/i, // "in the next days/weeks" - future period
  ];
  
  // Find the first match with context for debugging (detailed context goes to notes, not rewrite_instructions)
  // Run prediction scan on content without meta markers and sign-off
  const matchResult = firstMatchWithContext(contentForPredictionScan, futureCertaintyPatterns);
  const hasFutureCertainty = matchResult !== null;
  
  if (hasFutureCertainty && matchResult) {
    // Detailed match context for debugging/artifact only (don't echo violating phrase to model)
    const matchDetail = `Matched "${matchResult.match}" (pattern: ${matchResult.pattern}) in context: "...${matchResult.context}..."`;
    notes.push(`Avoid predictions; keep the tone reflective of today only. [DEBUG: ${matchDetail}]`);
    blocking_reasons.push("closing:prediction_language");
    // Keep rewrite instructions at high level to avoid feedback loop (don't include exact phrase)
    rewrite_instructions.push(`Remove future-oriented phrasing. Do not use words/phrases like: tomorrow, next, later, soon, coming days, going to, will (outside the locked sign-off). Keep the closing anchored to today/past/present. The only allowed 'tomorrow' is in the locked sign-off.`);
  }

  if (params.interpretive_frame.temporal_arc.arc_day_index > 1) {
    const cont = params.interpretive_frame.continuity;
    const hasHook =
      (cont.references_yesterday && middle.toLowerCase().includes(cont.references_yesterday.toLowerCase())) ||
      (cont.references_tomorrow && middle.toLowerCase().includes(cont.references_tomorrow.toLowerCase()));
    if (!hasHook) {
      notes.push("Closing should reference provided continuity when in mid-arc (day > 1).");
      rewrite_instructions.push("Include a provided continuity hook to tie back/forward in the arc.");
    }
  }

  if (notes.length === 0) {
    return { decision: "APPROVE", notes, blocking_reasons: [], rewrite_instructions: [] };
  }

  const decision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";
  return { decision, notes, blocking_reasons, rewrite_instructions };
}

