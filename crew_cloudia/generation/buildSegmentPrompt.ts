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

