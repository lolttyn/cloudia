import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/contracts/segmentWritingContracts.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";

export type SegmentGenerationResult = {
  segment_key: string;
  draft_script: string;

  metadata: {
    word_count: number;
    model_id: string;
    generation_timestamp: string;
  };

  self_check: {
    contract_violations: string[];
    canon_flags: string[];
  };
};

export function generateSegmentDraft(input: {
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

  // --- Prompt Assembly (placeholder) ---
  // NOTE: Actual prompt construction will be layered later.
  // For now, this function proves boundary + contract enforcement.
  const draft_script = `[DRAFT PLACEHOLDER] ${segment.segment_key}`;

  // --- Self-checks (intentionally shallow for now) ---
  const word_count = draft_script.split(/\s+/).length;

  return {
    segment_key: segment.segment_key,
    draft_script,
    metadata: {
      word_count,
      model_id: "UNSET",
      generation_timestamp: new Date().toISOString(),
    },
    self_check: {
      contract_violations: [],
      canon_flags: [],
    },
  };
}

