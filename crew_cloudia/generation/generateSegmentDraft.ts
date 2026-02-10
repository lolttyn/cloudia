import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/types/SegmentWritingContract.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";
import { buildSegmentPrompt, formatPriorScriptsBlock } from "./buildSegmentPrompt.js";
import { sanitizeEditorialFeedback } from "./sanitizeEditorialFeedback.js";
import { CLOUDIA_LLM_CONFIG, invokeLLM } from "./invokeLLM.js";
import { buildIntroScaffold } from "./introScaffold.js";
import { buildClosingScaffold } from "./closingScaffold.js";

export type SegmentGenerationResult = {
  segment_key: string;
  draft_script: string;
  generation_mode: "llm" | "hybrid" | "template";
  llm_usage: unknown | null;

  metadata: {
    word_count: number;
    model_id: string | null;
    generation_timestamp: string;
  };

  self_check: {
    contract_violations: string[];
    canon_flags: string[];
  };
};

export async function generateSegmentDraft(input: {
  episode_plan: EpisodeEditorialPlan;
  segment: SegmentPromptInput;
  writing_contract: SegmentWritingContract;
  episode_validation: EpisodeValidationResult;
}): SegmentGenerationResult {
  const {
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  } = input;

  // --- Preconditions (hard failures) ---
  if (!episode_plan.segments.some((s) => s.segment_key === segment.segment_key)) {
    throw new Error(
      `Segment ${segment.segment_key} not present in EpisodeEditorialPlan`
    );
  }

  if (
    episode_validation.blocking_segments.some(
      (b) => b.segment_key === segment.segment_key
    )
  ) {
    throw new Error(
      `Segment ${segment.segment_key} is globally blocked by episode validation`
    );
  }

  if (writing_contract.segment_key !== segment.segment_key) {
    throw new Error(
      `Writing contract does not match segment key (${segment.segment_key})`
    );
  }

  const generation =
    segment.segment_key === "intro"
      ? await generateIntroDraft({
          segment,
          interpretive_frame: (segment.constraints as any)?.interpretive_frame,
        })
      : segment.segment_key === "closing"
      ? await generateClosingDraft({
          segment,
          interpretive_frame: (segment.constraints as any)?.interpretive_frame,
        })
      : await generateGenericDraft({
          episode_plan,
          segment,
          writing_contract,
          episode_validation,
        });

  const draft_script = generation.text;

  // --- Self-checks (intentionally shallow for now) ---
  const word_count = draft_script.trim() === "" ? 0 : draft_script.trim().split(/\s+/).length;
  const contract_violations: string[] = [];
  const canon_flags: string[] = [];

  // Required sections present?
  const normalized_draft = normalizeForSectionMatch(draft_script);
  for (const section of writing_contract.required_sections) {
    if (!section.required) continue;

    if (section.enforcement === "structural") {
      if (
        !sectionSatisfied({
          segment_key: segment.segment_key,
          draft: draft_script,
          normalized: normalized_draft,
          key: section.key,
        })
      ) {
        contract_violations.push(`missing_required_section:${section.key}`);
      }
    }
    // Semantic sections are evaluated by editors/scorers, not auto-flagged here.
  }

  // Word count bounds (skip min check for intro/closing since scaffold is fixed-length)
  const { min_words, max_words } = writing_contract.length_constraints;
  if (!["intro", "closing"].includes(segment.segment_key) && word_count < min_words) {
    contract_violations.push(`word_count_below_min:${word_count}<${min_words}`);
  }
  if (word_count > max_words) {
    contract_violations.push(`word_count_above_max:${word_count}>${max_words}`);
  }

  // Forbidden phrases (simple substring match)
  const draft_lower = draft_script.toLowerCase();
  for (const phrase of writing_contract.forbidden_elements.phrases) {
    const phrase_normalized = phrase.trim();
    if (phrase_normalized.length === 0) continue;
    if (draft_lower.includes(phrase_normalized.toLowerCase())) {
      contract_violations.push(`forbidden_phrase:${phrase_normalized}`);
    }
  }

  // Canon flags (lightweight heuristics)
  if (hasOverconfidentFutureLanguage(draft_lower)) {
    canon_flags.push("overconfident_future_claim");
  }
  if (hasAbsoluteFutureClaim(draft_lower)) {
    canon_flags.push("absolute_future_claim");
  }

  return {
    segment_key: segment.segment_key,
    draft_script,
    generation_mode: generation.mode,
    llm_usage: generation.llm_usage ?? null,
    metadata: {
      word_count,
      model_id: generation.model_id ?? CLOUDIA_LLM_CONFIG.model ?? null,
      generation_timestamp: new Date().toISOString(),
    },
    self_check: {
      contract_violations,
      canon_flags,
    },
  };
}

async function generateGenericDraft(params: {
  episode_plan: EpisodeEditorialPlan;
  segment: SegmentPromptInput;
  writing_contract: SegmentWritingContract;
  episode_validation: EpisodeValidationResult;
}): Promise<{
  text: string;
  mode: "llm";
  model_id: string | null;
  llm_usage: unknown | null;
}> {
  const assembled_prompt = buildSegmentPrompt({
    episode_plan: params.episode_plan,
    segment: params.segment,
    writing_contract: params.writing_contract,
    episode_validation: params.episode_validation,
  });

  const llm_result = await invokeLLM(assembled_prompt, CLOUDIA_LLM_CONFIG);

  if (llm_result.status !== "ok") {
    throw new Error(
      `LLM generation failed (${llm_result.error_type}): ${llm_result.message}`
    );
  }

  return {
    text: llm_result.text,
    mode: "llm",
    model_id: llm_result.model ?? CLOUDIA_LLM_CONFIG.model ?? null,
    llm_usage: llm_result.usage ?? null,
  };
}

async function generateIntroDraft(params: {
  segment: SegmentPromptInput;
  interpretive_frame?: {
    dominant_contrast_axis?: { statement?: string };
    why_today_clause?: string;
    sky_anchors?: { label?: string }[];
    temporal_phase?: string;
    intensity_modifier?: string;
    continuity?: { references_yesterday?: string; references_tomorrow?: string };
    interpretation_bundles?: { primary?: unknown[]; secondary?: unknown[] };
  };
}): Promise<{
  text: string;
  mode: "hybrid";
  model_id: string | null;
  llm_usage: unknown | null;
}> {
  const frame = params.interpretive_frame;
  if (!frame) {
    throw new Error("Intro generation requires an interpretive_frame");
  }
  const axisPrimary = frame.dominant_contrast_axis?.primary;
  const axisCounter = frame.dominant_contrast_axis?.counter;
  const whyClause = frame.why_today_clause;
  if (!axisPrimary || !axisCounter || !whyClause) {
    throw new Error("Intro generation requires dominant_contrast_axis (primary and counter) and why_today_clause");
  }

  const scaffold = buildIntroScaffold({
    episode_date: params.segment.episode_date,
    axis_primary: axisPrimary,
    axis_counter: axisCounter,
    why_today_clause: whyClause,
  });

  const anchorLabels = (frame.sky_anchors ?? []).map((a) => a.label).filter(Boolean);
  if (anchorLabels.length === 0) {
    throw new Error("Intro generation requires at least one sky anchor label");
  }

  const temporalPhase = frame.temporal_phase;
  const intensity = frame.intensity_modifier;
  const continuityLines = [
    frame.continuity?.references_yesterday,
    frame.continuity?.references_tomorrow,
  ].filter(Boolean);

  // Get exact greeting format expected by validator (must match verbatim)
  // Extract from scaffold - first line is the greeting
  const expectedGreeting = scaffold.split("\n")[0];

  const priorScripts = (params.segment.constraints as { prior_scripts?: Record<string, { main_themes?: string }> } | undefined)?.prior_scripts;
  const priorBlock = priorScripts && Object.keys(priorScripts).length > 0
    ? formatPriorScriptsBlock({ prior_scripts: priorScripts, episode_date: params.segment.episode_date })
    : "";

  const user_prompt = `
${priorBlock}CRITICAL: The greeting below is LOCKED. It must appear verbatim in the final intro. Do NOT modify, paraphrase, or rewrite it. You may only write exactly two sentences that come AFTER this greeting.

LOCKED GREETING (copy verbatim, ASCII apostrophes only):
"${expectedGreeting}"

Write exactly two sentences that follow the greeting above.
Each sentence must:
- Reference at least one of these sky anchors by label: ${anchorLabels.join(", ")}.
- Reinforce the dominant contrast by showing "${axisPrimary}" vs "${axisCounter}" in real-life moments (no slogans).
- Include causal language using the word "because".
- Acknowledge today's temporal phase "${temporalPhase}" and intensity "${intensity}".
${continuityLines.length ? "- Include at least one provided continuity hook." : ""}

CRITICAL: Include at least two concrete, behavioral or observational moments from daily life—what you do, choose, or notice. Use examples like:
- "you might linger over a second cup of coffee"
- "don't be surprised if you feel like reorganizing your desk"
- "you might catch yourself slowing down on your walk"
- "the way you pause before answering a text"
- "reaching for the same snack when you're thinking something through"
- "staring out the window a beat longer than usual"
- "skipping the shortcut and taking the longer route"
- "needing to stand up and move before the next task"
No abstract nouns without an example. Ground in behavior and small daily observations, not in object-to-cosmic-meaning chains. IMPORTANT: Vary your examples—do not reuse the same situations across episodes.

Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into behavioral, observational moments—what you do, choose, or notice in daily life (body, home, street, food, weather, commute, conversation, waiting). Avoid work-admin metaphors (inbox, calendar, email, meetings).

Additional constraints:
- Do NOT include any greeting - the greeting is already in the scaffold above and will be combined with your sentences.
- Do not use any set phrase for this contrast. Reference the contrast through lived experience; do not repeat any canned axis phrase.
- Express why today matters in your own words; do not reproduce the why-today clause or any interpretive frame label verbatim.
- Do not describe episode structure or meta framing.
- Target 20-30 words per sentence.

Interpretation bundles (only allowed meaning):
${JSON.stringify(
  {
    primary: frame.interpretation_bundles?.primary ?? [],
    secondary: frame.interpretation_bundles?.secondary ?? [],
  },
  null,
  2
)}
${
  (params.segment.constraints as { editorial_feedback?: string } | undefined)?.editorial_feedback
    ? `\n\nEditorial direction from reviewer (incorporate this guidance):\n${sanitizeEditorialFeedback((params.segment.constraints as { editorial_feedback?: string }).editorial_feedback!)}\n\n`
    : ""
}
Return only the two sentences, nothing else.`.trim();

  const systemPrompt =
    "You are Cloudia, a queer astrology-fluent bestie writing two warm, conversational sentences—no jargon, no formality." +
    (priorBlock
      ? " When prior scripts are provided above, build on the narrative arc—callbacks, progression, or contrast—without repeating the same patterns."
      : "");

  const llm_result = await invokeLLM(
    {
      system_prompt: systemPrompt,
      user_prompt,
    },
    { ...CLOUDIA_LLM_CONFIG, max_tokens: 160 }
  );

  if (llm_result.status !== "ok") {
    throw new Error(
      `LLM generation failed (${llm_result.error_type}): ${llm_result.message}`
    );
  }

  const micro = llm_result.text.trim();
  return {
    text: `${scaffold}\n${micro}`,
    mode: "hybrid",
    model_id: llm_result.model ?? CLOUDIA_LLM_CONFIG.model ?? null,
    llm_usage: llm_result.usage ?? null,
  };
}

async function generateClosingDraft(params: {
  segment: SegmentPromptInput;
  interpretive_frame?: {
    dominant_contrast_axis?: { statement?: string };
    timing?: { state?: string; notes?: string };
    temporal_phase?: string;
    interpretation_bundles?: { primary?: unknown[]; secondary?: unknown[] };
  };
}): Promise<{
  text: string;
  mode: "hybrid";
  model_id: string | null;
  llm_usage: unknown | null;
}> {
  const frame = params.interpretive_frame;
  if (!frame) {
    throw new Error("Closing generation requires an interpretive_frame");
  }
  const axisPrimary = frame.dominant_contrast_axis?.primary;
  const axisCounter = frame.dominant_contrast_axis?.counter;
  if (!axisPrimary || !axisCounter) {
    throw new Error("Closing generation requires dominant_contrast_axis (primary and counter)");
  }

  const timingNote = frame.timing?.notes ?? frame.timing?.state;
  const { scaffold, signoff } = buildClosingScaffold({
    episode_date: params.segment.episode_date,
    axis_primary: axisPrimary,
    axis_counter: axisCounter,
    timing_note: timingNote,
    temporal_phase: (frame.temporal_phase as any) ?? "baseline",
  });

  const priorScripts = (params.segment.constraints as { prior_scripts?: Record<string, { main_themes?: string }> } | undefined)?.prior_scripts;
  const priorBlock = priorScripts && Object.keys(priorScripts).length > 0
    ? formatPriorScriptsBlock({ prior_scripts: priorScripts, episode_date: params.segment.episode_date })
    : "";

  const user_prompt = `
${priorBlock}The dominant contrast is "${axisPrimary}" vs "${axisCounter}". Do not use any set phrase for this contrast. Reference it through lived experience; do not repeat any canned axis phrase.
Never use the phrase "meaning over minutiae" (or close paraphrases). Instead, translate into sensory, physical, interpersonal, or environmental moments (body, home, street, food, weather, commute, conversation, waiting, noise, silence). Use concrete examples like:
- "the way your shoulders drop when you step outside"
- "the breath you didn't realize you were holding"
- "the pause before you speak"
- "the way the light hits the window"
- "the warmth of the mug in your hands"
- "the hum of the refrigerator in a quiet room"
- "the feeling of cool air on your face"
- "the way your jaw unclenches"
- "the rhythm of your walking pace"
- "the moment before you open a door"
Avoid work-admin metaphors (inbox, calendar, email, meetings, double-checking details, triage). IMPORTANT: Vary your examples—do not reuse the same micro-situations across episodes.
Today's temporal phase is "${frame.temporal_phase}". Match the polarity without naming it:
- building → anticipation, gathering, noticing
- peak → intensity, presence, immediacy
- releasing → letting go, settling, integration
- aftershock → echo, residue, quiet clarity

Write exactly two sentences that help the listener feel today's close.
Each sentence must:
- Speak directly to the listener ("you", "your", or "this moment").
- Be reflective and experiential; stay with what is felt or noticed right now.
- Stay non-prescriptive (no advice) and non-predictive (no future claims).
- Avoid introducing new concepts or re-explaining earlier sections.
- Keep energy at or below the phase.

Additional constraints:
- No greeting.
- No sign-off language.
- Do not restate the dominant axis or temporal phase; they are already stated above.
- Keep it concise and calm; no commands.
- CRITICAL: The closing must start with exactly one of these phrases (verbatim, ASCII apostrophes) as the beginning of the segment: "It's okay to …" OR "You don't have to …" OR "You might notice …" (present tense only; no "will", "soon", "next", "tomorrow"). Use ASCII apostrophe (') NOT curly apostrophe ('). The soft-permission phrase must be the first words of the closing (sentence 1).
- Example with ASCII apostrophes at start: "It's okay to let the small stuff stay small tonight. The rest can wait."

CRITICAL: Do not reference the future outside the locked sign-off.
Specifically, do not use words/phrases like: tomorrow, next, later, soon, coming days, what's coming next, going to, will (outside the sign-off).
Keep the closing anchored to today/past/present ("as the day winds down…", "what you noticed today…").
HARD CONSTRAINT: All verbs must be present or past tense (e.g., "you noticed", "it showed up", "you felt", not "you will notice", "it's going to show", "you'll feel").
Before finalizing, scan your draft and remove any mention of: tomorrow, next, later, soon, coming, will, going to. If you find any of these words (outside the locked sign-off), rewrite those sentences using present/past tense only.

Interpretation bundles (only allowed meaning):
${JSON.stringify(
  {
    primary: frame.interpretation_bundles?.primary ?? [],
    secondary: frame.interpretation_bundles?.secondary ?? [],
  },
  null,
  2
)}
${
  (params.segment.constraints as { editorial_feedback?: string } | undefined)?.editorial_feedback
    ? `\n\nEditorial direction from reviewer (incorporate this guidance):\n${sanitizeEditorialFeedback((params.segment.constraints as { editorial_feedback?: string }).editorial_feedback!)}\n\n`
    : ""
}
Return only the two sentences, nothing else.`.trim();

  const closingSystemPrompt =
    "You are Cloudia, a queer astrology-fluent bestie writing two warm, grounded closing sentences—no jargon, no predictions." +
    (priorBlock
      ? " When prior scripts are provided above, avoid repeating the same closing pattern or permission phrase as recent days."
      : "");

  const llm_result = await invokeLLM(
    {
      system_prompt: closingSystemPrompt,
      user_prompt,
    },
    { ...CLOUDIA_LLM_CONFIG, max_tokens: 160 }
  );

  if (llm_result.status !== "ok") {
    throw new Error(
      `LLM generation failed (${llm_result.error_type}): ${llm_result.message}`
    );
  }

  const micro = llm_result.text.trim();
  return {
    text: `${scaffold}\n${micro}\n${signoff}`,
    mode: "hybrid",
    model_id: llm_result.model ?? CLOUDIA_LLM_CONFIG.model ?? null,
    llm_usage: llm_result.usage ?? null,
  };
}

function hasOverconfidentFutureLanguage(text: string): boolean {
  const markers = ["will definitely", "guarantees", "certainly will", "will absolutely"];
  return markers.some((marker) => text.includes(marker));
}

function hasAbsoluteFutureClaim(text: string): boolean {
  const patterns = [/\bthis will happen\b/, /\bit will happen\b/, /\bwill occur\b/];
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeForSectionMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function sectionSatisfied(params: {
  segment_key: string;
  draft: string;
  normalized: string;
  key: string;
}): boolean {
  const { segment_key, draft, normalized, key } = params;
  // Default: legacy structural match by key token.
  if (normalized.includes(key)) return true;

  const lower = draft.toLowerCase();

  if (segment_key === "main_themes") {
    if (key === "primary_meanings") {
      return /what\s+today[’']?s\s+really\s+about/.test(lower) || /main\s+thing/.test(lower);
    }
    if (key === "relevance") {
      return /why\s+this\s+is\s+showing\s+up\s+now/.test(lower) || /why\s+today/.test(lower);
    }
    if (key === "concrete_example") {
      return /how\s+this\s+might\s+show\s+up/.test(lower) || /for\s+example/.test(lower);
    }
    if (key === "confidence_alignment") {
      return /how\s+seriously\s+to\s+take\s+this/.test(lower) || /pretty\s+solid|grain\s+of\s+salt/.test(lower);
    }
  }

  if (segment_key === "reflection") {
    if (key === "integration") {
      return /tie\s+this\s+together|pull\s+this\s+together|one\s+takeaway/.test(lower);
    }
    if (key === "uncertainty") {
      return /uncertain|not\s+sure|wiggle\s+room/.test(lower);
    }
    if (key === "lived_perspective") {
      return /in\s+real\s+life|in\s+your\s+day|how\s+this\s+could\s+feel/.test(lower);
    }
  }

  if (segment_key === "closing") {
    if (key === "emotional_resolution") {
      return /settle|land|close\s+out/.test(lower);
    }
    if (key === "reaffirmation") {
      return /sticking\s+with|stayed\s+with|remember/.test(lower);
    }
  }

  return false;
}

