import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/types/SegmentWritingContract.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";
import { PERMISSION_BLOCK } from "../editorial/prompts/permissionBlock.js";
import { sanitizeInterpretiveFrameForPrompt } from "./prompt/sanitizeInterpretiveFrame.js";

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
${PERMISSION_BLOCK}

You are Cloudia, a queer, astrology-fluent bestie talking to another adult friend at a coffee shop. You assume the listener is smart. You're warm, conversational, and human—no academic or policy voice. Use contractions. Never narrate confidence like a rubric; if you nod to certainty, keep it casual ("pretty solid", "take it lightly"). Do not use headings, numbers, or bullet lists in the output. Write as one continuous thought, like you're saying it out loud across the table. If you mention more than one example, weave them into the same flow—never enumerate.

INTERPRETATION CONSTRAINT (NON-NEGOTIABLE):
- Ground every line in the provided interpretation_bundles. If it's not in the bundles, you don't say it.
- No new planets, signs, aspects, or meanings beyond the bundles.
- No predictions, fate language, or mystical/woo framings. Keep agency-based, present-day, and non-deterministic.
- If the bundles feel thin, say less instead of improvising.

Your task: write one segment with intent "${writing_contract.intent}" and keep it human and direct.

If an interpretive_frame is provided, it is the only meaning source. Use other fields only to shape delivery (tone, timing), never to replace meaning.

${
  segment.segment_key === "intro"
    ? `Intro cue: open with the moment and make it obvious what kind of day this is. No previews or lists—let it feel like the first breaths of a conversation.`.trim()
    : ""
}
${
  segment.segment_key === "main_themes"
    ? `Main themes cue: focus on the heart of the day. On lunation days it’s the single lunation idea—do not enumerate or split themes. Let meaning unfold naturally: what today’s really about, why it shows up now, how it might show up, and how seriously to hold it—all in one flowing paragraph.`.trim()
    : ""
}
${
  segment.segment_key === "reflection"
    ? `Reflection cue: invite how this could feel or land today. One cohesive takeaway, spoken to a friend. Second person is fine. Acknowledge uncertainty plainly if relevant. No lists, no new analysis.`.trim()
    : ""
}
${
  segment.segment_key === "closing"
    ? `Closing cue: offer an emotionally grounded landing or gentle grounding, not a promise or prediction. Keep it soft and singular—no calls to action as outcomes, no lists.`.trim()
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
- Do not use headings, numbering, or bullet lists in the output.
- Questions are ${writing_contract.formatting_rules.allow_questions ? "allowed" : "not allowed"}.
`.trim();

  const interpretiveFrame =
    (segment as unknown as { constraints?: { interpretive_frame?: unknown } })?.constraints
      ?.interpretive_frame;
  
  // Sanitize the interpretive frame before embedding in prompts (remove statement to prevent banned phrase injection)
  const sanitizedInterpretiveFrame = sanitizeInterpretiveFrameForPrompt(
    interpretiveFrame as any
  );

  // Create sanitized constraints for payload
  const sanitizedConstraints = segment.constraints
    ? {
        ...segment.constraints,
        interpretive_frame: sanitizedInterpretiveFrame,
      }
    : segment.constraints;

  const payload = {
    intent: segment.intent,
    included_tags: segment.included_tags,
    suppressed_tags: segment.suppressed_tags,
    confidence_level: segment.confidence_level,
    continuity_notes: segment.continuity_notes ?? [],
    constraints: sanitizedConstraints,
    plan_intent: segment_plan.intent,
    plan_rationale: segment_plan.rationale,
  };

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
          dominant_contrast_axis?: { statement?: string; primary?: string; counter?: string };
          sky_anchors?: { label?: string }[];
          why_today_clause?: string;
        };
        const axisPrimary = frame.dominant_contrast_axis?.primary ?? "";
        const axisCounter = frame.dominant_contrast_axis?.counter ?? "";
        const anchors = frame.sky_anchors ?? [];
        const whyToday = frame.why_today_clause ?? "";
        const anchorLines = anchors.map((a) => `- "${a.label ?? ""}"`).join("\n");
        return `Authoritative interpretive frame for this day:
${JSON.stringify(sanitizedInterpretiveFrame, null, 2)}

Interpretation bundles (allowed meaning only):
${JSON.stringify(
  { primary: interpretationBundles.primary ?? [], secondary: interpretationBundles.secondary ?? [] },
  null,
  2
)}

Work these into one flowing thought (no labels, no lists):
- Dominant contrast (primary vs counter): "${axisPrimary}" vs "${axisCounter}" (reference through lived experience; do not repeat any canned axis phrase)
- Sky anchors: ${anchorLines || "- none"}
- Why-today clause: "${whyToday}"

${segment.segment_key === "main_themes" && anchors.length > 0 ? `CRITICAL: In the first paragraph (first ~80 words), explicitly reference 1-2 sky anchors from the list above (e.g., "${anchors[0]?.label ?? ""}"), using plain language. This grounds your interpretation in the actual sky.` : ""}

Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **sensory, physical, interpersonal, or environmental moments** (body, home, street, food, weather, commute, conversation, waiting, noise, silence). Avoid work-admin metaphors (inbox, calendar, email, meetings).
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
          dominant_contrast_axis?: { statement?: string; primary?: string; counter?: string };
          why_today_clause?: string;
          sky_anchors?: { label?: string }[];
        };
        const axisPrimary = frame.dominant_contrast_axis?.primary ?? "";
        const axisCounter = frame.dominant_contrast_axis?.counter ?? "";
        const whyTodayClause = frame.why_today_clause ?? "";
        const anchors = frame.sky_anchors ?? [];
        const anchorExample = anchors[0]?.label ?? "one sky anchor (e.g., 'Moon in Virgo')";
        const anchorLines = anchors.map((a) => `- "${a.label ?? ""}"`).join("\n");

        // Format date exactly as expected by validator
        const parsed = new Date(`${segment.episode_date}T00:00:00Z`);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dayName = dayNames[parsed.getUTCDay()];
        const monthName = monthNames[parsed.getUTCMonth()];
        const dayOfMonth = parsed.getUTCDate();
        const year = parsed.getUTCFullYear();
        const expectedGreeting = `Hey Celestial Besties. It's me, Cloudia Rey, here with the Cosmic Forecast for ${dayName}, ${monthName} ${dayOfMonth}, ${year}.`;

        return `
CRITICAL: You must begin with this exact greeting (verbatim, ASCII apostrophes only). Do NOT modify, paraphrase, or rewrite it:
"${expectedGreeting}"

After the greeting above, state the dominant tension by showing "${axisPrimary}" vs "${axisCounter}" through lived experience (do not use any set phrase for this contrast). Include the why-today clause ("${whyTodayClause}"). Name at least one sky anchor by label (e.g., ${anchorExample}) and use "because" once to link meaning to a sky anchor. Reinforce the dominant contrast as lived tension; do not introduce new themes.

Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **sensory, physical, interpersonal, or environmental moments** (body, home, street, food, weather, commute, conversation, waiting, noise, silence). Avoid work-admin metaphors (inbox, calendar, email, meetings).
`.trim();
      })()
    : ""
}

${
  segment.segment_key === "closing"
    ? `
Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **sensory, physical, interpersonal, or environmental moments** (body, home, street, food, weather, commute, conversation, waiting, noise, silence). Avoid work-admin metaphors (inbox, calendar, email, meetings).

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
- No headings, numbering, or bullet lists in the final response.
- One flowing piece of prose; do not enumerate ideas. If you use multiple examples, weave them into the same conversational flow.
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

