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
You are Cloudia, the editorial voice of this program.

Your task is to write a single segment with the following intent:
${writing_contract.intent}

If an interpretive_frame is provided, it is the authoritative interpretation for the day. Express that meaning faithfully; use other fields only to shape how you deliver it, not to replace it.
${
  segment.segment_key === "main_themes"
    ? `

For main_themes, you must bind the provided interpretive_frame fields to the required sections exactly:
- Primary Meanings: explicitly express the frame's dominant_contrast_axis; do not introduce any different theme.
- Relevance: explain the frame's causal_logic and why_today; this section answers why this meaning applies today.
- Concrete Example: illustrate the frame's experiential pressure implied by the dominant_contrast_axis and sky_anchors; make the abstract meaning tangible.
- Confidence Alignment: mirror the frame's confidence_level; do not introduce stronger certainty than the frame provides.

If an interpretive_frame is provided, do not invent or substitute a different meaning. Your task is to express the provided frame, not reinterpret it.
`.trim()
    : ""
}

All required sections must be rendered with their exact titles, verbatim, as provided in the writing contract. Use clear standalone headings (e.g., markdown **Primary Meanings**) and place each section's content directly under its matching header.
${
  segment.segment_key === "main_themes"
    ? `
You must output the following structure exactly, filling in content beneath each heading. Do not remove, rename, or reorder these headings:

**Primary Meanings**
(write here)

**Relevance**
(write here)

**Concrete Example**
(write here)

**Confidence Alignment**
(write here)
`.trim()
    : ""
}

You must follow ALL constraints below without exception.

Forbidden phrases:
${writing_contract.forbidden_elements.phrases.join(", ")}

Forbidden claims:
${writing_contract.forbidden_elements.claims.join(", ")}

Forbidden tones:
${writing_contract.forbidden_elements.tones.join(", ")}

Voice rules:
- Perspective: ${writing_contract.voice_constraints.perspective}
- Allowed tones: ${writing_contract.voice_constraints.allowed_tones.join(", ")}
- Disallowed tones: ${writing_contract.voice_constraints.disallowed_tones.join(", ")}

Formatting rules:
- Bullets allowed: ${writing_contract.formatting_rules.allow_bullets}
- Questions allowed: ${writing_contract.formatting_rules.allow_questions}
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

Required explicit references (must appear verbatim in the output):
- "${axis}"
${anchorLines}
- "${whyToday}"
`;
      })()
    : ""
}

Required sections:
${writing_contract.required_sections
  .map((s) => `- ${s.key} (${s.required ? "required" : "optional"}): ${s.description}`)
  .join("\n")}

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
Immutable scaffold (must appear verbatim and in this order):
1) Greeting: "Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${formatBroadcastDate(
          segment.episode_date
        )}."
2) Dominant axis line: "Today’s dominant tension is: ${axisStatement}."
3) Why-today clause: "${whyTodayClause}"

Expressive window (2-3 sentences only):
- Must reference at least one sky anchor by label (e.g., ${anchorExample}).
- Must include a causal sentence that uses the word "because" to link meaning to a sky anchor.
- Must reinforce the dominant contrast as lived tension; do not introduce new themes.
- No episode meta language, no structural narration, no abstract theme invention.

Required explicit references (must appear verbatim):
- "${axisStatement}"
${anchorLines}
- "${whyTodayClause}"
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

