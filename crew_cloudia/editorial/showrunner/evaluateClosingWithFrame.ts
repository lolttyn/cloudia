import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";

const ADVICE_PATTERNS = [/you should/i, /\bshould\b/i, /\bneed to\b/i, /\bmust\b/i, /\btry to\b/i];
const PREDICTION_PATTERNS = [/\bwill\b/i, /\bgoing to\b/i, /\bsoon\b/i];
const REFLECTIVE_PATTERNS = [/\bfeel\b/i, /\bnotice\b/i, /\bsense\b/i, /\bbreath/i, /\bholding\b/i, /\bsitting with\b/i, /\bcaring\b/i, /\bcarrying\b/i];
const LISTENER_PATTERN = /\b(you|your|this moment)\b/i;
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

  const hasScaffold = script.includes(scaffold);
  const hasSignoff = script.includes(signoff);

  if (!hasScaffold) {
    notes.push("Closing scaffold is missing or altered.");
    blocking_reasons.push("closing:scaffold_missing");
  }

  if (!hasSignoff) {
    notes.push("Closing sign-off is missing or altered.");
    blocking_reasons.push("closing:signoff_missing");
  }

  // Extract the middle micro-reflection content
  const middle = script
    .replace(scaffold, "")
    .replace(signoff, "")
    .trim();

  const middleLower = middle.toLowerCase();

  const sentences = middle
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length !== 2) {
    notes.push("Closing must include exactly two reflective sentences between scaffold and sign-off.");
    blocking_reasons.push("closing:expressive_window_length");
    rewrite_instructions.push("Provide exactly two reflective sentences (no more, no less).");
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

  if (axis && middleLower.includes(axis.toLowerCase())) {
    const msg = "Do not restate the dominant axis verbatim in the closing; let the scaffold carry that meaning.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  if (middleLower.includes(temporalPhase)) {
    const msg = "Do not restate the temporal phase label in the closing; it's already in the scaffold.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  const hasAdvice = ADVICE_PATTERNS.some((re) => re.test(middle));
  if (hasAdvice) {
    notes.push("Avoid advice or directives; keep the tone observational.");
    blocking_reasons.push("closing:advice_language");
    rewrite_instructions.push("Remove advice language (e.g., 'should', 'need to', directives).");
  }

  const hasPrediction = PREDICTION_PATTERNS.some((re) => re.test(middle));
  if (hasPrediction) {
    notes.push("Avoid predictions; keep the tone reflective of today only.");
    blocking_reasons.push("closing:prediction_language");
    rewrite_instructions.push("Remove predictive language (e.g., 'will', 'going to').");
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

