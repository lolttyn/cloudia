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
import { markSegmentReadyForAudio } from "./crew_cloudia/audio/markSegmentReadyForAudio.js";
import { InterpretiveFrame } from "./crew_cloudia/interpretation/schema/InterpretiveFrame.js";
import { invokeLLM, CLOUDIA_LLM_CONFIG } from "./crew_cloudia/generation/invokeLLM.js";
import {
  EditorFeedback,
  MAX_SEGMENT_RETRIES,
} from "./crew_cloudia/editorial/showrunner/editorContracts.js";
import { evaluateClosingWithFrame } from "./crew_cloudia/editorial/showrunner/evaluateClosingWithFrame.js";
import { buildClosingScaffold } from "./crew_cloudia/generation/closingScaffold.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

export async function runClosingForDate(params: {
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
    throw new Error("interpretive_frame is required for closing generation");
  }

  const episode_plan: EpisodeEditorialPlan = {
    episode_date: params.episode_date,
    segments: [
      {
        segment_key: "closing",
        intent: ["close_the_day"],
        included_tags: ["theme:closure"],
        suppressed_tags: [],
        rationale: ["rule:closing"],
      },
    ],
    continuity_notes: {
      callbacks: [],
      avoided_repetition: [],
    },
    debug: {
      selected_by_segment: {
        intro: [],
        main_themes: [],
        reflection: [],
        closing: ["rule:closing"],
      },
      suppressed_by_rule: {},
    },
  };

  const segment: SegmentPromptInput = {
    episode_date: params.episode_date,
    segment_key: "closing",
    intent: ["close_the_day"],
    included_tags: ["theme:closure"],
    suppressed_tags: [],
    confidence_level: params.interpretive_frame.confidence_level ?? "medium",
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

  const writing_contract = getWritingContract("closing");

  let script = "";
  let rewriteInstructions: string[] = [];
  let approved = false;
  let lastDecision: EditorFeedback["decision"] | null = null;

  let scaffold = "";
  let signoff = "";
  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    const axis = params.interpretive_frame.dominant_contrast_axis.statement;
    const timingNote =
      params.interpretive_frame.timing?.notes ?? params.interpretive_frame.timing?.state;
    const scaffoldBuild = buildClosingScaffold({
      episode_date: params.episode_date,
      axis_statement: axis,
      timing_note: timingNote,
      temporal_phase: params.interpretive_frame.temporal_phase,
    });
    scaffold = scaffoldBuild.scaffold;
    signoff = scaffoldBuild.signoff;

    if (attempt === 0) {
      const draft = await generateSegmentDraft({
        episode_plan,
        segment,
        writing_contract,
        episode_validation,
      });
      const micro = extractMicroReflection(draft.draft_script, scaffold, signoff);
      script = assembleClosingScript(scaffold, micro, signoff);
    } else {
      const rewritePromptPayload = {
        system_prompt: "You are a precise editorial rewrite assistant for the closing.",
        user_prompt: buildClosingMicroRewritePrompt({
          interpretive_frame: params.interpretive_frame,
          previous_micro: extractMicroReflection(script, scaffold, signoff),
          editor_notes: rewriteInstructions,
        }),
      };
      const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
      if (rewriteResult.status !== "ok") {
        throw new Error(
          `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
        );
      }
      const micro = rewriteResult.text.trim();
      script = assembleClosingScript(scaffold, micro, signoff);
    }

    const evaluation = evaluateClosingWithFrame({
      interpretive_frame: params.interpretive_frame,
      episode_date: params.episode_date,
      draft_script: script,
      attempt,
      max_attempts: MAX_SEGMENT_RETRIES,
      scaffold,
      signoff,
    });

    lastDecision = evaluation.decision;
    if (evaluation.decision === "APPROVE") {
      approved = true;
      break;
    }

    const hasScaffoldBug =
      evaluation.blocking_reasons.includes("closing:scaffold_missing") ||
      evaluation.blocking_reasons.includes("closing:signoff_missing");

    if (hasScaffoldBug) {
      throw new Error(
        `Closing scaffold/sign-off missing or altered; this is a code bug, not a rewrite issue. Notes: ${evaluation.notes.join(
          " | "
        )}`
      );
    }

    if (evaluation.decision === "FAIL_EPISODE" || attempt === MAX_SEGMENT_RETRIES - 1) {
      throw new Error(
        `Episode failed: closing could not meet editor rubric after ${attempt + 1} attempts. Notes: ${evaluation.notes.join(
          " | "
        )}`
      );
    }

    rewriteInstructions =
      evaluation.rewrite_instructions.length > 0
        ? evaluation.rewrite_instructions
        : evaluation.notes;
  }

  if (!approved || lastDecision !== "APPROVE") {
    throw new Error(
      "Episode failed: closing did not achieve editor approval within allowed attempts."
    );
  }

  assertClosingAssemblyInvariant(script, scaffold, signoff);

  const today = new Date().toISOString().slice(0, 10);
  const mappedDiagnostics = mapDiagnosticsToEditorialViolations({
    canon_violations: [],
    structural_violations: [],
  });

  const gateResult = evaluateEditorialGate({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "closing",
    time_context: params.time_context ?? (params.episode_date === today ? "day_of" : "future"),
    generated_script: script,
    diagnostics: mappedDiagnostics,
    segment_contract: {
      allows_rewrites: false,
    },
    policy_version: "v0.1",
    max_attempts_remaining: 0,
  });

  const attemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: "closing",
  });

  await persistSegmentVersion({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "closing",
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
      segment_key: "closing",
      script_text: script,
      script_version: attemptNumber,
      gate_policy_version: gateResult.policy_version,
    });

    await markSegmentReadyForAudio({
      episode_id: params.episode_id,
      segment_key: "closing",
    });
  }

  await persistEditorialGateResult({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "closing",
    gate_result: gateResult,
  });

  return {
    segment_key: "closing",
    gate_result: gateResult,
  };
}

function buildClosingMicroRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  previous_micro: string;
  editor_notes: string[];
}) {
  const notes =
    params.editor_notes.length > 0
      ? params.editor_notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "No notes provided.";

  return `
Rewrite the closing micro-reflection (two sentences only). Do not change the scaffold or sign-off; they are fixed outside this prompt.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

Requirements:
- Produce exactly two sentences.
- Reflective and observational; no advice, no directives, no "you should".
- Reinforce (without restating verbatim) the dominant contrast axis: "${params.interpretive_frame.dominant_contrast_axis.statement}".
- No predictions; stay with today.
- No greeting, no sign-off language.

Editor notes to address:
${notes}

Previous micro-reflection (for reference only, do not copy):
${params.previous_micro}
`.trim();
}

function extractMicroReflection(script: string, scaffold: string, signoff: string): string {
  const withoutScaffold = script.replace(scaffold, "").trim();
  const withoutSignoff = withoutScaffold.replace(signoff, "").trim();
  return withoutSignoff;
}

function assembleClosingScript(scaffold: string, micro: string, signoff: string): string {
  const microClean = micro.trim();
  return `${scaffold}\n\n${microClean}\n\n${signoff}`;
}

function assertClosingAssemblyInvariant(script: string, scaffold: string, signoff: string): void {
  if (!script.includes(scaffold) || !script.includes(signoff)) {
    throw new Error("Closing assembly invariant violated");
  }
}

async function main() {
  const episode_date = "2025-01-01";
  const episode_id = `episode-${episode_date}`;
  await runClosingForDate({
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

