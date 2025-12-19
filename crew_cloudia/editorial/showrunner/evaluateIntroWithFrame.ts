import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";
import { buildIntroScaffold } from "../../generation/introScaffold.js";

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
  const ingressSensitiveBodies = ["moon", "sun"];
  const ADVICE_PATTERNS = [/you should/i, /\bshould\b/i, /\bneed to\b/i, /\bmust\b/i, /\btry to\b/i];
  const PREDICTION_PATTERNS = [/\bwill\b/i, /\bgoing to\b/i, /\bsoon\b/i];
  const LISTENER_PATTERN = /\b(you|your|today|this moment)\b/i;
  const INTENSITY_CUES: Record<string, string[]> = {
    emerging: ["opening", "fresh", "just starting", "early", "arriving"],
    strengthening: ["building", "rising", "gathering", "picking up", "mounting"],
    dominant: ["intense", "all in", "at the forefront", "commanding", "center stage"],
    softening: ["settling", "easing", "unwinding", "softening", "exhale"],
  };

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

  // Require static anchors for ingress-sensitive bodies present in the frame
  const missingIngressAnchors: string[] = [];
  for (const anchor of params.interpretive_frame.sky_anchors) {
    const lowerLabel = anchor.label.toLowerCase();
    const bodyMentioned = ingressSensitiveBodies.some((body) =>
      lowerLabel.startsWith(`${body} in `)
    );
    if (bodyMentioned && !lower.includes(lowerLabel)) {
      missingIngressAnchors.push(anchor.label);
    }
  }
  if (missingIngressAnchors.length > 0) {
    notes.push(
      `Intro must reference ingress-sensitive anchors: ${missingIngressAnchors
        .map((a) => `"${a}"`)
        .join(", ")}.`
    );
    blocking_reasons.push("intro:ingress_anchor_missing");
    for (const label of missingIngressAnchors) {
      rewrite_instructions.push(`Include the exact anchor phrase: "${label}".`);
    }
  }

  // Require causal language
  if (!/\bbecause\b/i.test(script)) {
    notes.push('Intro must include causal language using "because".');
    blocking_reasons.push("intro:causal_missing");
    rewrite_instructions.push('Add a causal sentence that includes the word "because".');
  }

  // Scaffold presence
  const scaffold = buildIntroScaffold({
    episode_date: params.episode_date,
    axis: params.interpretive_frame.dominant_contrast_axis.statement,
    why_today_clause: params.interpretive_frame.why_today_clause,
  });
  if (!script.includes(scaffold)) {
    notes.push("Intro scaffold is missing or altered.");
    blocking_reasons.push("intro:scaffold_missing");
    rewrite_instructions.push("Ensure the scaffold lines appear verbatim and first.");
  }

  // Expressive window: must be exactly two sentences beyond the scaffold.
  const remainder = script.replace(scaffold, "").trim();
  const sentenceCount = remainder
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
  if (sentenceCount !== 2) {
    notes.push("Intro must include exactly two expressive sentences after the scaffold.");
    blocking_reasons.push("intro:expressive_window_length");
    rewrite_instructions.push("Return exactly two sentences after the scaffold.");
  }

  // Expressive window constraints (affective only)
  if (!LISTENER_PATTERN.test(remainder)) {
    notes.push('Intro expressive lines should address the listener (e.g., "you", "today", "this moment").');
    rewrite_instructions.push('Address the listener directly in the two expressive sentences (e.g., "you", "your", "today").');
  }

  const intensityKey = params.interpretive_frame.intensity_modifier.toLowerCase();
  const cues = INTENSITY_CUES[intensityKey] ?? [];
  if (cues.length > 0 && !cues.some((cue) => remainder.toLowerCase().includes(cue))) {
    notes.push("Intro expressive tone should reflect today's intensity modulation (use matching tone cues, not arc explanations).");
    rewrite_instructions.push("Match the intensity tone (e.g., use cues that feel like the current intensity) without restating arc mechanics.");
  }

  if (/\b(yesterday|tomorrow)\b/i.test(remainder)) {
    notes.push("Intro expressive lines should not mention yesterday or tomorrow; continuity is handled by the scaffold.");
    rewrite_instructions.push("Remove explicit mentions of yesterday or tomorrow from the expressive lines.");
  }

  if (ADVICE_PATTERNS.some((re) => re.test(remainder))) {
    notes.push("Intro expressive lines should avoid advice or directives.");
    rewrite_instructions.push("Remove advice/directive language (e.g., 'should', 'need to').");
  }

  if (PREDICTION_PATTERNS.some((re) => re.test(remainder))) {
    notes.push("Intro expressive lines should avoid predictions; keep to present-moment tone.");
    rewrite_instructions.push("Remove predictive language (e.g., 'will', 'going to', 'soon').");
  }

  if (notes.length === 0) {
    return { decision: "APPROVE", notes, blocking_reasons: [], rewrite_instructions: [] };
  }

  const decision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";
  return { decision, notes, blocking_reasons, rewrite_instructions };
}
