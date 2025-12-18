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
    ? `Authoritative interpretive frame for this day:
${JSON.stringify(interpretiveFrame, null, 2)}
`
    : ""
}

Required sections:
${writing_contract.required_sections
  .map((s) => `- ${s.key} (${s.required ? "required" : "optional"}): ${s.description}`)
  .join("\n")}

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

