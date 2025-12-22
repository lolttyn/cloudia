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

  // Phase D: Semantic check for core tension/theme (not verbatim requirement)
  // The intro must orient the listener toward the day's core tension, but can express it naturally
  const axisStatement = params.interpretive_frame.dominant_contrast_axis.statement;
  const axisPrimary = params.interpretive_frame.dominant_contrast_axis.primary.toLowerCase();
  const axisCounter = params.interpretive_frame.dominant_contrast_axis.counter.toLowerCase();
  
  // Check if the meaning is present semantically (either primary or counter concept appears)
  const hasAxisMeaning = lower.includes(axisPrimary) || lower.includes(axisCounter) || 
                         lower.includes(axisStatement.toLowerCase());
  
  if (!hasAxisMeaning) {
    // Downgrade to warning, not blocking - allow natural expression
    notes.push(`Intro should orient the listener toward the day's core tension (${axisPrimary} vs ${axisCounter}), but can express it in natural language.`);
    // Do NOT add to blocking_reasons - this is now a soft requirement
  }

  // Phase D: Semantic check for "why today" - must convey temporal significance
  const whyTodayClause = params.interpretive_frame.why_today_clause.toLowerCase();
  // Check if the meaning is present (either verbatim or semantically)
  const hasWhyToday = lower.includes(whyTodayClause) || 
                      params.interpretive_frame.why_today.some(w => lower.includes(w.toLowerCase()));
  
  if (!hasWhyToday) {
    // Downgrade to warning - allow natural expression of temporal significance
    notes.push(`Intro should convey why today matters (${params.interpretive_frame.why_today_clause}), but can express it naturally.`);
    // Do NOT add to blocking_reasons - this is now a soft requirement
  }

  // Phase D: Semantic check for sky anchors - must anchor to the sky, but not verbatim
  const missingSkyAnchors: string[] = [];
  for (const anchor of params.interpretive_frame.sky_anchors) {
    const lowerLabel = anchor.label.toLowerCase();
    // Check if the anchor is mentioned semantically (body + sign, not necessarily exact phrase)
    const bodyMatch = lowerLabel.match(/(\w+)\s+in\s+(\w+)/);
    if (bodyMatch) {
      const [, body, sign] = bodyMatch;
      const hasAnchor = lower.includes(body) && lower.includes(sign);
      if (!hasAnchor) {
        missingSkyAnchors.push(anchor.label);
      }
    } else {
      // Fallback: check for exact label if pattern doesn't match
      if (!lower.includes(lowerLabel)) {
        missingSkyAnchors.push(anchor.label);
      }
    }
  }
  if (missingSkyAnchors.length > 0) {
    // Downgrade to warning - sky anchoring is important but can be natural
    notes.push(
      `Intro should anchor to the sky (reference ${missingSkyAnchors.map(a => a.split(' in ')[0]).join(' or ')}), but can express it naturally.`
    );
    // Do NOT add to blocking_reasons - this is now a soft requirement
  }

  // Require causal language
  if (!/\bbecause\b/i.test(script)) {
    notes.push('Intro must include causal language using "because".');
    blocking_reasons.push("intro:causal_missing");
    rewrite_instructions.push('Add a causal sentence that includes the word "because".');
  }

  // Phase D: Remove rigid scaffold check - replaced with semantic requirements
  // The intro must establish emotional field, anchor to sky, and convey why today
  // But these can appear in any order and wording
  
  // Expressive window: relaxed to 1-3 sentences (Phase D alignment)
  const allSentences = script
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  
  // Count sentences after greeting (greeting is always first)
  // Note: greeting is already declared above (line 58), reuse it
  const afterGreeting = script.replace(greeting, "").trim();
  const expressiveSentences = afterGreeting
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  
  const sentenceCount = expressiveSentences.length;
  if (sentenceCount < 1 || sentenceCount > 3) {
    notes.push(`Intro should contain 1-3 expressive sentences (found ${sentenceCount}).`);
    // Downgrade to warning for now - allow natural rhythm
    // Only block if completely missing (0 sentences)
    if (sentenceCount === 0) {
      blocking_reasons.push("intro:expressive_window_length");
      rewrite_instructions.push("Add at least one expressive sentence after the greeting.");
    }
  }
  
  // Use afterGreeting for remainder checks (no scaffold to remove)
  const remainder = afterGreeting;

  // Expressive window constraints (affective only) - soft requirements
  if (!LISTENER_PATTERN.test(remainder)) {
    notes.push('Intro expressive lines should address the listener (e.g., "you", "today", "this moment").');
    rewrite_instructions.push('Address the listener directly in the expressive sentences (e.g., "you", "your", "today").');
    // Do NOT add to blocking_reasons - this is guidance, not a hard requirement
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
