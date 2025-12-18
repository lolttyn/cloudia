import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";

export function expectedIntroGreeting(episode_date: string): string {
  const parsed = new Date(`${episode_date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${episode_date}.`;
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayName = dayNames[parsed.getUTCDay()];
  const monthName = monthNames[parsed.getUTCMonth()];
  const dayOfMonth = parsed.getUTCDate();
  const year = parsed.getUTCFullYear();

  return `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${dayName}, ${monthName} ${dayOfMonth}, ${year}.`;
}

export function evaluateIntroWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  episode_date: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
}): EditorFeedback {
  const notes: string[] = [];
  const rewrite_instructions: string[] = [];
  const blocking_reasons: string[] = [];
  const script = params.draft_script;
  const lower = script.toLowerCase();

  // Hard gate: greeting must be verbatim
  const greeting = expectedIntroGreeting(params.episode_date);
  if (!script.includes(greeting)) {
    notes.push("Intro greeting is missing or altered from the canonical verbatim line.");
    blocking_reasons.push("intro:greeting_missing");
    rewrite_instructions.push(`Add the exact greeting: "${greeting}".`);
  }

  // Hard gate: meaning coherence with dominant axis (verbatim)
  const axis = params.interpretive_frame.dominant_contrast_axis.statement.toLowerCase();
  if (!lower.includes(axis)) {
    notes.push("Intro must include the dominant contrast axis verbatim (no substitutions).");
    blocking_reasons.push("intro:axis_missing");
    rewrite_instructions.push(
      `Include the dominant contrast axis exactly as "${params.interpretive_frame.dominant_contrast_axis.statement}".`
    );
  }

  // Why-today clause verbatim
  const whyTodayClause = params.interpretive_frame.why_today_clause;
  if (!lower.includes(whyTodayClause.toLowerCase())) {
    notes.push("Intro must include the why-today clause verbatim from the frame.");
    blocking_reasons.push("intro:why_today_missing");
    rewrite_instructions.push(`Insert the why-today clause verbatim: "${whyTodayClause}".`);
  }

  // At least one sky anchor referenced
  const anchorReferenced = params.interpretive_frame.sky_anchors.some((anchor) =>
    lower.includes(anchor.label.toLowerCase())
  );
  if (!anchorReferenced) {
    notes.push("Intro must reference at least one sky anchor label.");
    blocking_reasons.push("intro:sky_anchor_missing");
    rewrite_instructions.push(
      `Reference at least one sky anchor verbatim, e.g., "${params.interpretive_frame.sky_anchors[0]?.label}".`
    );
  }

  // Require causal language
  if (!/\bbecause\b/i.test(script)) {
    notes.push('Intro must include causal language using "because".');
    blocking_reasons.push("intro:causal_missing");
    rewrite_instructions.push('Add a causal sentence that includes the word "because".');
  }

  // Expressive window: constrain to 2–3 sentences beyond the immutable scaffold.
  const sentenceCount = script
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
  if (sentenceCount < 3) {
    notes.push("Intro should include at least two expressive sentences beyond the scaffold.");
    rewrite_instructions.push("Add 1-2 concise sentences that reinforce the axis as lived tension.");
  } else if (sentenceCount > 6) {
    notes.push("Intro should stay concise; reduce to the scaffold plus 2-3 expressive sentences.");
    rewrite_instructions.push("Reduce verbosity; keep only 2-3 expressive sentences after the scaffold.");
  }

  if (notes.length === 0) {
    return { decision: "APPROVE", notes, blocking_reasons: [], rewrite_instructions: [] };
  }

  const decision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";
  return { decision, notes, blocking_reasons, rewrite_instructions };
}
