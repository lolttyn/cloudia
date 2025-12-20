import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/types/SegmentWritingContract.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";

export type AssembledPrompt = {
  system_prompt: string;
  user_prompt: string;
};

export function buildSegmentPrompt(input: {
  episode_plan: EpisodeEditorialPlan;
  segment: SegmentPromptInput;
  writing_contract: SegmentWritingContract;
  episode_validation: EpisodeValidationResult;
}): AssembledPrompt {
  const {
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  } = input;

  // --- Resolve editorial intent ---
  const segment_plan = episode_plan.segments.find(
    (s) => s.segment_key === segment.segment_key
  );

  if (!segment_plan) {
    throw new Error(
      `Segment ${segment.segment_key} missing from editorial plan`
    );
  }

  // --- SYSTEM PROMPT (authority + constraints) ---
  const system_prompt = `
You are Cloudia, a queer, astrology-fluent bestie talking to another adult friend at a coffee shop. You assume the listener is smart. You’re warm, conversational, and human—no academic or policy voice. Use contractions. Never narrate confidence like a rubric; if you nod to certainty, keep it casual ("pretty solid", "take it lightly"). Do not use headings or bullet lists in the output. Avoid phrases like "Primary Meanings", "Relevance", "Confidence Alignment", "This interpretation aligns with", or "Based on the data".

INTERPRETATION CONSTRAINT (NON-NEGOTIABLE):
- Ground every line in the provided interpretation_bundles. If it's not in the bundles, you don't say it.
- No new planets, signs, aspects, or meanings beyond the bundles.
- No predictions, fate language, or mystical/woo framings. Keep agency-based, present-day, and non-deterministic.
- If the bundles feel thin, say less instead of improvising.

Your task: write one segment with intent "${writing_contract.intent}" and keep it human and direct.

If an interpretive_frame is provided, it is the only meaning source. Use other fields only to shape delivery (tone, timing), never to replace meaning.

${
  segment.segment_key === "intro"
    ? `Intro cue: frame the moment and make it obvious what kind of day this is without enumerating topics.`.trim()
    : ""
}
${
  segment.segment_key === "main_themes"
    ? `Main themes cue: focus on the heart of the day. On lunation days it’s the single lunation idea. Weave (no labels): what today’s really about; why it shows up now; how it might show up; how seriously to hold it in natural language.`.trim()
    : ""
}
${
  segment.segment_key === "reflection"
    ? `Reflection cue: invite how this could feel or land today. One cohesive takeaway. Acknowledge uncertainty plainly if relevant. No new analysis.`.trim()
    : ""
}
${
  segment.segment_key === "closing"
    ? `Closing cue: offer an emotionally grounded takeaway or gentle grounding, not a promise or prediction.`.trim()
    : ""
}

Keep all guardrails:
- Forbidden phrases: ${writing_contract.forbidden_elements.phrases.join(", ")}
- Forbidden claims: ${writing_contract.forbidden_elements.claims.join(", ")}
- Forbidden tones: ${writing_contract.forbidden_elements.tones.join(", ")}

Voice rules:
- Perspective: ${writing_contract.voice_constraints.perspective}
- Allowed tones: ${writing_contract.voice_constraints.allowed_tones.join(", ")}
- Disallowed tones: ${writing_contract.voice_constraints.disallowed_tones.join(", ")}

Formatting rules:
- Do not use headings or bullet lists in the output.
- Questions are ${writing_contract.formatting_rules.allow_questions ? "allowed" : "not allowed"}.
`.trim();

  const payload = {
    intent: segment.intent,
    included_tags: segment.included_tags,
    suppressed_tags: segment.suppressed_tags,
    confidence_level: segment.confidence_level,
    continuity_notes: segment.continuity_notes ?? [],
    constraints: segment.constraints,
    plan_intent: segment_plan.intent,
    plan_rationale: segment_plan.rationale,
  };

  const interpretiveFrame =
    (segment as unknown as { constraints?: { interpretive_frame?: unknown } })?.constraints
      ?.interpretive_frame;
  const interpretationBundles =
    (interpretiveFrame as any)?.interpretation_bundles ?? { primary: [], secondary: [] };

  const warningsSection =
    episode_validation.warnings.length > 0
      ? episode_validation.warnings
          .map((w) => `- ${w.segment_key}: ${w.warnings.join("; ")}`)
          .join("\n")
      : "- none";

  // --- USER PROMPT (what to say today) ---
  const user_prompt = `
Episode context:
${segment_plan.intent.join(", ")}

${
  interpretiveFrame
    ? (() => {
        const frame = interpretiveFrame as {
          dominant_contrast_axis?: { statement?: string };
          sky_anchors?: { label?: string }[];
          why_today_clause?: string;
        };
        const axis = frame.dominant_contrast_axis?.statement ?? "";
        const anchors = frame.sky_anchors ?? [];
        const whyToday = frame.why_today_clause ?? "";
        const anchorLines = anchors.map((a) => `- "${a.label ?? ""}"`).join("\n");
        return `Authoritative interpretive frame for this day:
${JSON.stringify(interpretiveFrame, null, 2)}

Interpretation bundles (allowed meaning only):
${JSON.stringify(
  { primary: interpretationBundles.primary ?? [], secondary: interpretationBundles.secondary ?? [] },
  null,
  2
)}

Weave these naturally (no labels or headings):
- Dominant contrast axis: "${axis}"
- Sky anchors: ${anchorLines || "- none"}
- Why-today clause: "${whyToday}"
`;
      })()
    : ""
}

Interpretation bundles (source of all allowed meaning):
${JSON.stringify(
  { primary: interpretationBundles.primary ?? [], secondary: interpretationBundles.secondary ?? [] },
  null,
  2
)}

${
  segment.segment_key === "intro"
    ? (() => {
        if (!interpretiveFrame) {
          throw new Error(
            "Intro prompt assembly requires an interpretive_frame but none was provided."
          );
        }

        const frame = interpretiveFrame as {
          dominant_contrast_axis?: { statement?: string };
          why_today_clause?: string;
          sky_anchors?: { label?: string }[];
        };
        const axisStatement = frame.dominant_contrast_axis?.statement ?? "";
        const whyTodayClause = frame.why_today_clause ?? "";
        const anchors = frame.sky_anchors ?? [];
        const anchorExample = anchors[0]?.label ?? "one sky anchor (e.g., 'Moon in Virgo')";
        const anchorLines = anchors.map((a) => `- "${a.label ?? ""}"`).join("\n");

        return `
Opening beats (keep them natural, no headings or bullets in the output):
- Greet casually and name the day (use the exact date string).
- State the dominant tension plainly: "${axisStatement}".
- Include the why-today clause: "${whyTodayClause}".
- Reference at least one sky anchor by label (e.g., ${anchorExample}).
- Use "because" once to link meaning to a sky anchor.
- Reinforce the dominant contrast as lived tension; do not introduce new themes.
`.trim();
      })()
    : ""
}

${
  segment.segment_key === "closing"
    ? `
You must end the episode with the following exact sign-off (verbatim). Do not paraphrase or alter it:

"The Cosmic Forecast for ${formatBroadcastDate(
        segment.episode_date
      )} is brought to you by the Intergalactic Public Broadcasting Network and is made possible by listeners like you. Tune in tomorrow, skygazer."
`.trim()
    : ""
}

Factual and interpretive inputs:
${JSON.stringify(payload, null, 2)}

Warnings to be mindful of:
${warningsSection}

Length:
Between ${writing_contract.length_constraints.min_words}
and ${writing_contract.length_constraints.max_words} words.

Output instructions:
- No headings or bullet lists in the final response.
- Write like a thoughtful friend at a coffee shop, not a lecturer or analyst.
`.trim();

  return {
    system_prompt,
    user_prompt,
  };
}

function formatBroadcastDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
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

  return `${dayName}, ${monthName} ${dayOfMonth}, ${year}`;
}

