import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";
import { buildClosingScaffold } from "../../generation/closingScaffold.js";

const ADVICE_PATTERNS = [/you should/i, /\bshould\b/i, /\bneed to\b/i, /\bmust\b/i, /\btry to\b/i];
const PREDICTION_PATTERNS = [/\bwill\b/i, /\bgoing to\b/i, /\bsoon\b/i];

export function evaluateClosingWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  episode_date: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
}): EditorFeedback {
  const notes: string[] = [];
  const rewrite_instructions: string[] = [];
  const blocking_reasons: string[] = [];
  const script = params.draft_script.trim();
  const lower = script.toLowerCase();

  const axis = params.interpretive_frame.dominant_contrast_axis.statement;
  const timingNote = params.interpretive_frame.timing?.notes ?? params.interpretive_frame.timing?.state;
  const { scaffold, signoff } = buildClosingScaffold({
    episode_date: params.episode_date,
    axis_statement: axis,
    timing_note: timingNote,
  });

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

  const sentences = middle
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length !== 2) {
    notes.push("Closing must include exactly two reflective sentences between scaffold and sign-off.");
    blocking_reasons.push("closing:expressive_window_length");
    rewrite_instructions.push("Provide exactly two reflective sentences (no more, no less).");
  }

  const hasAxisReinforcement = sentences.some((s) => s.toLowerCase().includes(axis.toLowerCase().split(" ")[0]));
  if (!hasAxisReinforcement) {
    const msg = "Closing should reinforce the dominant contrast axis in the reflective lines.";
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

  if (notes.length === 0) {
    return { decision: "APPROVE", notes, blocking_reasons: [], rewrite_instructions: [] };
  }

  const decision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";
  return { decision, notes, blocking_reasons, rewrite_instructions };
}

