import "dotenv/config";

import { generateSegmentDraft } from "./crew_cloudia/generation/generateSegmentDraft.js";
import { getWritingContract } from "./crew_cloudia/editorial/contracts/segmentWritingContracts.js";
import { mapDiagnosticsToEditorialViolations } from "./crew_cloudia/editorial/diagnostics/mapDiagnosticsToEditorialViolations.js";
import { evaluateEditorialGate } from "./crew_cloudia/editorial/gate/evaluateEditorialGate.js";
import { persistEditorialGateResult } from "./crew_cloudia/editorial/gate/persistEditorialGateResult.js";
import { EpisodeEditorialPlan } from "./crew_cloudia/editorial/planner/types.js";
import { SegmentPromptInput } from "./crew_cloudia/editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "./crew_cloudia/editorial/validation/episodeValidationResult.js";
import { persistSegmentVersion } from "./crew_cloudia/editorial/persistence/persistSegmentVersion.js";
import { upsertCurrentSegment } from "./crew_cloudia/editorial/persistence/upsertCurrentSegment.js";
import { getNextAttemptNumber } from "./crew_cloudia/editorial/persistence/getNextAttemptNumber.js";
import { getBatchAttemptCount } from "./crew_cloudia/editorial/persistence/getBatchAttemptCount.js";
import { buildRewritePrompt } from "./crew_cloudia/editorial/rewrite/buildRewritePrompt.js";
import { invokeLLM, CLOUDIA_LLM_CONFIG } from "./crew_cloudia/generation/invokeLLM.js";
import { markSegmentReadyForAudio } from "./crew_cloudia/audio/markSegmentReadyForAudio.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

const MAX_BATCH_ATTEMPTS = 5;

export async function runMainThemesForDate(params: {
  program_slug: string;
  episode_date: string;
  episode_id: string;
  batch_id: string;
  time_context: "day_of" | "future";
}): Promise<{
  segment_key: string;
  gate_result: ReturnType<typeof evaluateEditorialGate>;
}> {
  const episode_plan: EpisodeEditorialPlan = {
    episode_date: params.episode_date,
    segments: [
      {
        segment_key: "main_themes",
        intent: ["develop_primary_themes"],
        included_tags: ["theme:one"],
        suppressed_tags: [],
        rationale: ["rule:main_themes"],
      },
    ],
    continuity_notes: {
      callbacks: [],
      avoided_repetition: [],
    },
    debug: {
      selected_by_segment: {
        intro: [],
        main_themes: ["rule:main_themes"],
        reflection: [],
        closing: [],
      },
      suppressed_by_rule: {},
    },
  };

  const segment: SegmentPromptInput = {
    episode_date: params.episode_date,
    segment_key: "main_themes",
    intent: ["develop_primary_themes"],
    included_tags: ["theme:one"],
    suppressed_tags: [],
    confidence_level: "high",
    constraints: {
      max_ideas: 1,
      must_acknowledge_uncertainty: true,
      ban_repetition: true,
    },
  };

  const episode_validation: EpisodeValidationResult = {
    episode_date: params.episode_date,
    is_valid: true,
    segment_results: [],
    blocking_segments: [],
    warnings: [],
  };

  const writing_contract = getWritingContract("main_themes");
  const result = await generateSegmentDraft({
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  });

  const today = new Date().toISOString().slice(0, 10);
  const mappedDiagnostics = mapDiagnosticsToEditorialViolations({
    canon_violations: result.self_check.canon_flags,
    structural_violations: result.self_check.contract_violations,
  });

  const attemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: result.segment_key,
  });

  const time_context = params.time_context ?? (params.episode_date === today ? "day_of" : "future");
  let script = result.draft_script;

  let gateResult = evaluateEditorialGate({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: result.segment_key,
    time_context,
    generated_script: script,
    diagnostics: mappedDiagnostics,
    segment_contract: {
      allows_rewrites: false,
    },
    policy_version: "v0.1",
    max_attempts_remaining: 0,
  });

  await persistSegmentVersion({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: result.segment_key,
    attempt_number: attemptNumber,
    script_text: script,
    gate_decision: gateResult.decision,
    blocking_reasons: gateResult.blocking_reasons,
    gate_policy_version: gateResult.policy_version,
    batch_id: params.batch_id,
  });

  if (gateResult.decision === "approve") {
    await upsertCurrentSegment({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: result.segment_key,
      script_text: script,
      script_version: attemptNumber,
      gate_policy_version: gateResult.policy_version,
    });

    await markSegmentReadyForAudio({
      episode_id: params.episode_id,
      segment_key: result.segment_key,
    });
  }

  await persistEditorialGateResult({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: result.segment_key,
    gate_result: gateResult,
  });

  while (time_context === "future" && gateResult.decision === "block") {
    const batchAttempts = await getBatchAttemptCount({
      episode_id: params.episode_id,
      segment_key: result.segment_key,
      batch_id: params.batch_id,
    });

    if (batchAttempts >= MAX_BATCH_ATTEMPTS) {
      break;
    }

    const rewritePrompt = buildRewritePrompt({
      original_script: script,
      blocking_reasons: gateResult.blocking_reasons,
    });

    const attemptNumberRewrite = await getNextAttemptNumber({
      episode_id: params.episode_id,
      segment_key: result.segment_key,
    });

    const rewritePromptPayload = {
      system_prompt: "You are a precise editorial rewrite assistant.",
      user_prompt: rewritePrompt,
    };

    const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
    if (rewriteResult.status !== "ok") {
      throw new Error(
        `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
      );
    }

    script = rewriteResult.text;

    const rewriteDiagnostics = mapDiagnosticsToEditorialViolations(
      performSelfCheck(script, writing_contract)
    );

    gateResult = evaluateEditorialGate({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: result.segment_key,
      time_context,
      generated_script: script,
      diagnostics: rewriteDiagnostics,
      segment_contract: {
        allows_rewrites: false,
      },
      policy_version: "v0.1",
      max_attempts_remaining: Math.max(
        0,
        MAX_BATCH_ATTEMPTS - batchAttempts - 1
      ),
    });

    await persistSegmentVersion({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: result.segment_key,
      attempt_number: attemptNumberRewrite,
      script_text: script,
      gate_decision: gateResult.decision,
      blocking_reasons: gateResult.blocking_reasons,
      gate_policy_version: gateResult.policy_version,
      batch_id: params.batch_id,
    });

    if (gateResult.decision === "approve") {
      await upsertCurrentSegment({
        episode_id: params.episode_id,
        episode_date: params.episode_date,
        segment_key: result.segment_key,
        script_text: script,
        script_version: attemptNumberRewrite,
        gate_policy_version: gateResult.policy_version,
      });

      await markSegmentReadyForAudio({
        episode_id: params.episode_id,
        segment_key: result.segment_key,
      });

      await persistEditorialGateResult({
        episode_id: params.episode_id,
        episode_date: params.episode_date,
        segment_key: result.segment_key,
        gate_result: gateResult,
      });

      break;
    }

    await persistEditorialGateResult({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: result.segment_key,
      gate_result: gateResult,
    });
  }

  return {
    segment_key: result.segment_key,
    gate_result: gateResult,
  };
}

function performSelfCheck(
  draft_script: string,
  writing_contract: ReturnType<typeof getWritingContract>
): {
  canon_violations: string[];
  contract_violations: string[];
} {
  const word_count = draft_script.trim() === "" ? 0 : draft_script.trim().split(/\s+/).length;
  const contract_violations: string[] = [];
  const canon_violations: string[] = [];

  const normalized_draft = normalizeForSectionMatch(draft_script);
  for (const section of writing_contract.required_sections) {
    if (!section.required) continue;

    if (section.enforcement === "structural") {
      if (!normalized_draft.includes(section.key)) {
        contract_violations.push(`missing_required_section:${section.key}`);
      }
    }
  }

  const { min_words, max_words } = writing_contract.length_constraints;
  if (word_count < min_words) {
    contract_violations.push(`word_count_below_min:${word_count}<${min_words}`);
  }
  if (word_count > max_words) {
    contract_violations.push(`word_count_above_max:${word_count}>${max_words}`);
  }

  const draft_lower = draft_script.toLowerCase();
  for (const phrase of writing_contract.forbidden_elements.phrases) {
    const phrase_normalized = phrase.trim();
    if (phrase_normalized.length === 0) continue;
    if (draft_lower.includes(phrase_normalized.toLowerCase())) {
      contract_violations.push(`forbidden_phrase:${phrase_normalized}`);
    }
  }

  if (hasOverconfidentFutureLanguage(draft_lower)) {
    canon_violations.push("overconfident_future_claim");
  }
  if (hasAbsoluteFutureClaim(draft_lower)) {
    canon_violations.push("absolute_future_claim");
  }

  return { canon_violations, contract_violations };
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

async function main() {
  const episode_date = "2025-01-01";
  const episode_id = `episode-${episode_date}`;
  await runMainThemesForDate({
    program_slug: "cloudia",
    episode_date,
    episode_id,
    batch_id: "demo-batch",
    time_context: "future",
  });
}

if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}

