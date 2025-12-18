import "dotenv/config";

import { generateSegmentDraft } from "./crew_cloudia/generation/generateSegmentDraft.js";
import { evaluateEditorialGate } from "./crew_cloudia/editorial/gate/evaluateEditorialGate.js";
import { persistEditorialGateResult } from "./crew_cloudia/editorial/gate/persistEditorialGateResult.js";
import { getWritingContract } from "./crew_cloudia/editorial/contracts/segmentWritingContracts.js";
import { mapDiagnosticsToEditorialViolations } from "./crew_cloudia/editorial/diagnostics/mapDiagnosticsToEditorialViolations.js";
import { EpisodeEditorialPlan } from "./crew_cloudia/editorial/planner/types.js";
import { SegmentPromptInput } from "./crew_cloudia/editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "./crew_cloudia/editorial/validation/episodeValidationResult.js";
import { persistSegmentVersion } from "./crew_cloudia/editorial/persistence/persistSegmentVersion.js";
import { upsertCurrentSegment } from "./crew_cloudia/editorial/persistence/upsertCurrentSegment.js";
import { getNextAttemptNumber } from "./crew_cloudia/editorial/persistence/getNextAttemptNumber.js";
import { markSegmentReadyForAudio } from "./crew_cloudia/audio/markSegmentReadyForAudio.js";
import { InterpretiveFrame } from "./crew_cloudia/interpretation/schema/InterpretiveFrame.js";
import { evaluateIntroWithFrame } from "./crew_cloudia/editorial/showrunner/evaluateIntroWithFrame.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

export async function runIntroForDate(params: {
  program_slug: string;
  episode_date: string; // YYYY-MM-DD
  episode_id: string;
  batch_id: string;
  time_context: "day_of" | "future";
  interpretive_frame?: InterpretiveFrame;
}): Promise<{
  segment_key: string;
  gate_result: ReturnType<typeof evaluateEditorialGate>;
}> {
  if (!params.interpretive_frame) {
    throw new Error("interpretive_frame is required for intro generation");
  }

  const episode_plan: EpisodeEditorialPlan = {
    episode_date: params.episode_date,
    segments: [
      {
        segment_key: "intro",
        intent: ["introduce_one_theme"],
        included_tags: ["theme:one"],
        suppressed_tags: [],
        rationale: ["rule:intro"],
      },
    ],
    continuity_notes: {
      callbacks: [],
      avoided_repetition: [],
    },
    debug: {
      selected_by_segment: {
        intro: ["rule:intro"],
        main_themes: [],
        reflection: [],
        closing: [],
      },
      suppressed_by_rule: {},
    },
  };

  const segment: SegmentPromptInput = {
    episode_date: params.episode_date,
    segment_key: "intro",
    intent: ["introduce_one_theme"],
    included_tags: ["theme:one"],
    suppressed_tags: [],
    confidence_level: "high",
    constraints: {
      interpretive_frame: params.interpretive_frame,
      max_ideas: 1,
      must_acknowledge_uncertainty: false,
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

  const writing_contract = getWritingContract("intro");
  const result = await generateSegmentDraft({
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  });

  const introEvaluation = evaluateIntroWithFrame({
    interpretive_frame: params.interpretive_frame,
    episode_date: params.episode_date,
    draft_script: result.draft_script,
  });

  if (introEvaluation.decision === "FAIL_EPISODE") {
    throw new Error(
      `Episode failed: intro did not satisfy meaning or greeting requirements. Notes: ${introEvaluation.notes.join(
        " | "
      )}`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const mappedDiagnostics = mapDiagnosticsToEditorialViolations({
    canon_violations: result.self_check.canon_flags,
    structural_violations: result.self_check.contract_violations,
  });

  const attemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: result.segment_key,
  });

  const gateResult = evaluateEditorialGate({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: result.segment_key,
    time_context: params.time_context ?? (params.episode_date === today ? "day_of" : "future"),
    generated_script: result.draft_script,
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
    script_text: result.draft_script,
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
      script_text: result.draft_script,
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

  return {
    segment_key: result.segment_key,
    gate_result: gateResult,
  };
}

async function main() {
  const episode_date = "2025-01-01";
  const episode_id = `episode-${episode_date}`;
  await runIntroForDate({
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

