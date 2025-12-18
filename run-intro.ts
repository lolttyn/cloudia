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
import {
  EditorFeedback,
  MAX_SEGMENT_RETRIES,
} from "./crew_cloudia/editorial/showrunner/editorContracts.js";
import {
  evaluateIntroWithFrame,
  expectedIntroGreeting,
} from "./crew_cloudia/editorial/showrunner/evaluateIntroWithFrame.js";
import { invokeLLM, CLOUDIA_LLM_CONFIG } from "./crew_cloudia/generation/invokeLLM.js";

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

  let script = "";
  let rewriteInstructions: string[] = [];
  let approved = false;
  let lastDecision: EditorFeedback["decision"] | null = null;

  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    if (attempt === 0) {
      const draft = await generateSegmentDraft({
        episode_plan,
        segment,
        writing_contract,
        episode_validation,
      });
      script = draft.draft_script;
    } else {
      const rewritePromptPayload = {
        system_prompt: "You are a precise editorial rewrite assistant for the intro.",
        user_prompt: buildIntroRewritePrompt({
          interpretive_frame: params.interpretive_frame,
          previous_script: script,
          editor_notes: rewriteInstructions,
          episode_date: params.episode_date,
        }),
      };
      const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
      if (rewriteResult.status !== "ok") {
        throw new Error(
          `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
        );
      }
      script = rewriteResult.text;
    }

    const introEvaluation = evaluateIntroWithFrame({
      interpretive_frame: params.interpretive_frame,
      episode_date: params.episode_date,
      draft_script: script,
      attempt,
      max_attempts: MAX_SEGMENT_RETRIES,
    });

    lastDecision = introEvaluation.decision;

    if (introEvaluation.decision === "APPROVE") {
      approved = true;
      break;
    }

    if (introEvaluation.decision === "FAIL_EPISODE" || attempt === MAX_SEGMENT_RETRIES - 1) {
      throw new Error(
        `Episode failed: intro did not satisfy meaning requirements after ${attempt + 1} attempts. Notes: ${introEvaluation.notes.join(
          " | "
        )}`
      );
    }

    rewriteInstructions =
      introEvaluation.rewrite_instructions.length > 0
        ? introEvaluation.rewrite_instructions
        : introEvaluation.notes;
  }

  if (!approved || lastDecision !== "APPROVE") {
    throw new Error(
      "Episode failed: intro did not achieve editor approval within allowed attempts."
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const mappedDiagnostics = mapDiagnosticsToEditorialViolations(
    performSelfCheck(script, writing_contract)
  );

  const attemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: "intro",
  });

  const gateResult = evaluateEditorialGate({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "intro",
    time_context: params.time_context ?? (params.episode_date === today ? "day_of" : "future"),
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
    segment_key: "intro",
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
      segment_key: "intro",
      script_text: script,
      script_version: attemptNumber,
      gate_policy_version: gateResult.policy_version,
    });

    await markSegmentReadyForAudio({
      episode_id: params.episode_id,
      segment_key: "intro",
    });
  }

  await persistEditorialGateResult({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "intro",
    gate_result: gateResult,
  });

  return {
    segment_key: "intro",
    gate_result: gateResult,
  };
}

function buildIntroRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  previous_script: string;
  editor_notes: string[];
  episode_date: string;
}) {
  const notes =
    params.editor_notes.length > 0
      ? params.editor_notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "No notes provided.";

  return `
You are rewriting an intro segment to satisfy the editor rubric. Fix only the cited issues.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

Required explicit references (must appear verbatim in the output):
- "${params.interpretive_frame.dominant_contrast_axis.statement}"
${params.interpretive_frame.sky_anchors.map((a) => `- "${a.label}"`).join("\n")}
- "${params.interpretive_frame.why_today_clause}"

You must follow this scaffold:
- Greeting (verbatim): "${expectedIntroGreeting(params.episode_date)}"
- Dominant axis line: "Today’s dominant tension is: ${params.interpretive_frame.dominant_contrast_axis.statement}."
- Why-today clause: "${params.interpretive_frame.why_today_clause}"
- Expressive window: 2-3 sentences that reference at least one sky anchor and include a causal sentence using "because".

Rewrite instructions to address:
${notes}

Previous draft:
${params.previous_script}

Requirements:
- Do not add meta narration or episode-structure commentary.
- Keep the intro concise; only 2-3 expressive sentences after the scaffold.
- Reinforce the dominant contrast as a lived tension, grounded in the sky anchor(s).
`.trim();
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

  const draft_lower = draft_script.toLowerCase();

  const { min_words, max_words } = writing_contract.length_constraints;
  if (word_count < min_words) {
    contract_violations.push(`word_count_below_min:${word_count}<${min_words}`);
  }
  if (word_count > max_words) {
    contract_violations.push(`word_count_above_max:${word_count}>${max_words}`);
  }

  for (const phrase of writing_contract.forbidden_elements.phrases) {
    const phrase_normalized = phrase.trim();
    if (phrase_normalized.length === 0) continue;
    if (draft_lower.includes(phrase_normalized.toLowerCase())) {
      contract_violations.push(`forbidden_phrase:${phrase_normalized}`);
    }
  }

  return { canon_violations, contract_violations };
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

