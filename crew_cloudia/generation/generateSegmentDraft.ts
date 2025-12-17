import { EpisodeEditorialPlan } from "../editorial/planner/types.js";
import { SegmentPromptInput } from "../editorial/contracts/segmentPromptInput.js";
import { SegmentWritingContract } from "../editorial/types/SegmentWritingContract.js";
import { EpisodeValidationResult } from "../editorial/validation/episodeValidationResult.js";
import { buildSegmentPrompt } from "./buildSegmentPrompt.js";
import { CLOUDIA_LLM_CONFIG, invokeLLM } from "./invokeLLM.js";

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

  const assembled_prompt = buildSegmentPrompt({
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  });

  const llm_result = await invokeLLM(assembled_prompt, CLOUDIA_LLM_CONFIG);

  if (llm_result.status !== "ok") {
    throw new Error(
      `LLM generation failed (${llm_result.error_type}): ${llm_result.message}`
    );
  }

  const draft_script = llm_result.text;

  // --- Self-checks (intentionally shallow for now) ---
  const word_count = draft_script.trim() === "" ? 0 : draft_script.trim().split(/\s+/).length;
  const contract_violations: string[] = [];
  const canon_flags: string[] = [];

  // Required sections present?
  const normalized_draft = normalizeForSectionMatch(draft_script);
  for (const section of writing_contract.required_sections) {
    if (!section.required) continue;

    if (section.enforcement === "structural") {
      if (!normalized_draft.includes(section.key)) {
        contract_violations.push(`missing_required_section:${section.key}`);
      }
    }
    // Semantic sections are evaluated by editors/scorers, not auto-flagged here.
  }

  // Word count bounds
  const { min_words, max_words } = writing_contract.length_constraints;
  if (word_count < min_words) {
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
    metadata: {
      word_count,
      model_id: llm_result.model ?? CLOUDIA_LLM_CONFIG.model,
      generation_timestamp: new Date().toISOString(),
    },
    self_check: {
      contract_violations,
      canon_flags,
    },
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

