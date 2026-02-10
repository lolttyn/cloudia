import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/types/SegmentWritingContract.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";
import { PERMISSION_BLOCK } from "../editorial/prompts/permissionBlock.js";
import { sanitizeInterpretiveFrameForPrompt } from "./prompt/sanitizeInterpretiveFrame.js";
import { sanitizeEditorialFeedback } from "./sanitizeEditorialFeedback.js";
import {
  extractPhaseNameFromFrame,
  mapPhaseNameToLunationLabel,
} from "../interpretation/lunationLabel.js";

export type AssembledPrompt = {
  system_prompt: string;
  user_prompt: string;
};

/** Format prior week scripts for narrative arc (main_themes only). Exported for intro/closing hybrid prompts. */
export function formatPriorScriptsBlock(opts: {
  prior_scripts: Record<string, { main_themes?: string }>;
  episode_date: string;
}): string {
  const { prior_scripts, episode_date } = opts;
  const datesBeforeToday = Object.keys(prior_scripts)
    .filter((d) => d < episode_date)
    .sort();
  if (datesBeforeToday.length === 0) return "";
  const lines: string[] = [
    "## Scripts from earlier this week (for narrative continuity)",
    "Use these to maintain arc—callbacks, progression, contrast. Don't copy or repeat. Today's script must be grounded in today's sky data.",
    "",
  ];
  for (const date of datesBeforeToday) {
    const main = prior_scripts[date]?.main_themes;
    if (main?.trim()) {
      lines.push(`[${date}]`);
      lines.push("main_themes: " + main.trim().replace(/\n/g, " ").slice(0, 2000));
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}

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
Never reproduce interpretive frame labels, why_today_clause text, or sky_anchor labels verbatim. Express those ideas in Cloudia's conversational voice.

${
  segment.segment_key === "intro"
    ? `Intro cue: open with the moment and make it obvious what kind of day this is. No previews or lists—let it feel like the first breaths of a conversation.`.trim()
    : ""
}
${
  segment.segment_key === "main_themes"
    ? `Main themes cue: focus on the heart of the day. On lunation days it’s the single lunation idea—do not enumerate or split themes. Let meaning unfold naturally: what today’s really about, why it shows up now, how it might show up, and how seriously to hold it—all in one flowing paragraph. Hard constraint: do not mention Moon sign or Moon ingress. Do not describe the Moon moving between signs. Anchor the interpretation to lunation only.`.trim()
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
${
  (segment.constraints as { prior_scripts?: Record<string, { intro?: string; main_themes?: string; closing?: string }> } | undefined)?.prior_scripts &&
  Object.keys((segment.constraints as any).prior_scripts).length > 0
    ? `

NARRATIVE ARC (when prior scripts are provided below):
The podcast is a continuous daily story. Each episode builds on the previous days—you can reference yesterday's themes, show how energy evolved, create callbacks, or draw contrasts. The sky doesn't stop between episodes and neither should the narrative.
When the Moon or energy shifts, acknowledge the transition as a story beat: what were we working with yesterday, and how does today's energy shift that?
Never repeat the same metaphor, advice, or structural pattern from the previous 3 days. If yesterday ended with a permission phrase like "you don't have to fix this today," today needs a different landing.`
    : ""
}
`.trim();

  const interpretiveFrame =
    (segment as unknown as { constraints?: { interpretive_frame?: unknown } })?.constraints
      ?.interpretive_frame;
  
  // Sanitize the interpretive frame before embedding in prompts (remove statement to prevent banned phrase injection)
  const sanitizedInterpretiveFrame = sanitizeInterpretiveFrameForPrompt(
    interpretiveFrame as any
  );
  const stripMoonTransitFromFrame = (frame: any): any => {
    if (!frame) return frame;
    const clone = JSON.parse(JSON.stringify(frame));
    const moonTransitPattern =
      /\bmoon\b[^.!?\n]{0,60}\b(in|entered|enters|entering|moving into|moves into|moved into|shifted|slipped)\b/i;
    const moonInSignPattern =
      /\bmoon\b[^.!?\n]{0,60}\bin\s+(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i;

    if (Array.isArray(clone.sky_anchors)) {
      clone.sky_anchors = clone.sky_anchors.filter(
        (anchor: any) => !/^moon in\s+/i.test(anchor?.label ?? "")
      );
    }
    if (typeof clone.why_today_clause === "string") {
      if (moonTransitPattern.test(clone.why_today_clause) || moonInSignPattern.test(clone.why_today_clause)) {
        clone.why_today_clause = "";
      }
    }
    if (Array.isArray(clone.why_today)) {
      clone.why_today = clone.why_today.filter(
        (line: string) =>
          !moonTransitPattern.test(line) && !moonInSignPattern.test(line)
      );
    }
    if (Array.isArray(clone.causal_logic)) {
      clone.causal_logic = clone.causal_logic.filter(
        (line: string) =>
          !moonTransitPattern.test(line) && !moonInSignPattern.test(line)
      );
    }
    return clone;
  };
  const sanitizedInterpretiveFrameForSegment =
    segment.segment_key === "main_themes"
      ? stripMoonTransitFromFrame(sanitizedInterpretiveFrame)
      : sanitizedInterpretiveFrame;

  // Create sanitized constraints for payload
  const sanitizedConstraints = segment.constraints
    ? {
        ...segment.constraints,
        interpretive_frame: sanitizedInterpretiveFrameForSegment,
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

  // --- Prior scripts block (narrative arc): main_themes only, dates before today ---
  const priorScripts = (segment.constraints as { prior_scripts?: Record<string, { main_themes?: string }> } | undefined)?.prior_scripts;
  const priorScriptsBlock =
    priorScripts && Object.keys(priorScripts).length > 0
      ? formatPriorScriptsBlock({ prior_scripts: priorScripts, episode_date: segment.episode_date })
      : "";

  // --- USER PROMPT (what to say today) ---
  const user_prompt = `
${priorScriptsBlock}Episode context:
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
        const lunationContextLabel = (frame as any)?.lunation_context?.label;
        const phaseNameForPrompt = extractPhaseNameFromFrame(frame as any);
        const lunationLabelResult = mapPhaseNameToLunationLabel(phaseNameForPrompt);
        const lunationLabel =
          lunationContextLabel ??
          (lunationLabelResult.isFallback ? undefined : lunationLabelResult.label);
        const lunationLine =
          segment.segment_key === "main_themes"
            ? `- Lunation phase (use this label verbatim): "${lunationLabel ?? "Lunar phase"}"`
            : `- Sky anchors: ${anchorLines || "- none"}`;
        const whyTodayLine =
          segment.segment_key === "main_themes"
            ? '- Why-today clause: (use the lunation phase label only; do not mention Moon sign or ingress)'
            : `- Why-today clause: "${whyToday}"`;
        return `Authoritative interpretive frame for this day:
${JSON.stringify(sanitizedInterpretiveFrameForSegment, null, 2)}

Interpretation bundles (allowed meaning only):
${JSON.stringify(
  { primary: interpretationBundles.primary ?? [], secondary: interpretationBundles.secondary ?? [] },
  null,
  2
)}

Work these into one flowing thought (no labels, no lists):
- Dominant contrast (primary vs counter): "${axisPrimary}" vs "${axisCounter}" (reference through lived experience; do not repeat any canned axis phrase)
${lunationLine}
${whyTodayLine}

${segment.segment_key === "main_themes" ? `HARD CONSTRAINT: Do not mention Moon sign or Moon ingress. Do not describe the Moon moving between signs. Anchor the interpretation to lunation only, using the lunation phase label provided above.` : ""}
${segment.segment_key === "main_themes" ? `CRITICAL FORMAT REQUIREMENT: Your first sentence must include the lunation phase label "${lunationLabel ?? "Lunar phase"}" verbatim exactly once. Allowed openings include: "${lunationLabel ?? "Lunar phase"}: ...", "Under the ${lunationLabel ?? "Lunar phase"}, ...", or "With the ${lunationLabel ?? "Lunar phase"} overhead, ...". The first sentence must be a normal, flowing sentence; do not use any other label prefix or colon.` : ""}
${segment.segment_key === "main_themes" ? `A soft permission closer like "you don't have to fix this today" should appear at most 2–3 times per week. On other days, end differently—with a concrete micro-action, a gentle reframe, or by letting your last thought land without a tagline.${priorScriptsBlock ? " Check the prior days' scripts above to see if you've already used a permission closer this week." : ""}` : ""}

Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **behavioral, observational moments**—what you do, choose, or notice in daily life (body, home, street, food, weather, commute, conversation, waiting). Avoid work-admin metaphors (inbox, calendar, email, meetings).
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

After the greeting above, state the dominant tension by showing "${axisPrimary}" vs "${axisCounter}" through lived experience (do not use any set phrase for this contrast). Express why today matters in your own words; do not copy the why-today clause verbatim. Name at least one sky anchor by label (e.g., ${anchorExample}) and use "because" once to link meaning to a sky anchor. Reinforce the dominant contrast as lived tension; do not introduce new themes.

Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **behavioral, observational moments**—what you do, choose, or notice in daily life (body, home, street, food, weather, commute, conversation, waiting). Avoid work-admin metaphors (inbox, calendar, email, meetings).
`.trim();
      })()
    : ""
}

${
  segment.segment_key === "closing"
    ? `
Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into **behavioral, observational moments**—what you do, choose, or notice in daily life (body, home, street, food, weather, commute, conversation, waiting). Avoid work-admin metaphors (inbox, calendar, email, meetings).

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

${
  (segment.constraints as { editorial_feedback?: string } | undefined)?.editorial_feedback
    ? `Editorial direction from reviewer (incorporate this guidance):\n${sanitizeEditorialFeedback((segment.constraints as { editorial_feedback?: string }).editorial_feedback!)}\n\n`
    : ""
}
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

