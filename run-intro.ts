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
import { buildIntroScaffold } from "./crew_cloudia/generation/introScaffold.js";
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
        user_prompt: buildIntroExpressiveRewritePrompt({
          interpretive_frame: params.interpretive_frame,
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

      const expressiveText = rewriteResult.text.trim();
      const sentenceCount = countSentences(expressiveText);
      if (sentenceCount !== 2) {
        rewriteInstructions = [
          `Return exactly two sentences (found ${sentenceCount}). No greeting, no scaffold, no sign-off.`,
        ];
        continue;
      }

      const scaffold = buildIntroScaffold({
        episode_date: params.episode_date,
        axis: params.interpretive_frame.dominant_contrast_axis.statement,
        why_today_clause: params.interpretive_frame.why_today_clause,
      });

      script = `${scaffold}\n\n${expressiveText}`;
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

function buildIntroExpressiveRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  editor_notes: string[];
  episode_date: string;
}) {
  const notes =
    params.editor_notes.length > 0
      ? params.editor_notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "No notes provided.";

  const intensity = params.interpretive_frame.intensity_modifier.toLowerCase();
  const intensityCues: Record<string, string[]> = {
    emerging: ["calm", "spacious", "gentle", "fresh", "opening"],
    strengthening: ["gathering", "rising", "stirring", "picking up", "sharpening"],
    dominant: ["vivid", "charged", "immediate", "center-stage", "alive"],
    softening: ["easing", "unwinding", "integrating", "settling", "exhale"],
  };
  const cues = intensityCues[intensity] ?? [];

  return `
You are rewriting ONLY the two expressive sentences of the intro. The scaffold (greeting + axis line + why-today clause) is locked and will be inserted by the system. You must NOT include the greeting, scaffold lines, or sign-off. Return EXACTLY TWO sentences, plain text only.

Authoritative interpretive frame (context only, do not restate as scaffold):
${JSON.stringify(params.interpretive_frame, null, 2)}

Required explicit references (must appear verbatim in your two sentences):
- At least one sky anchor from: ${params.interpretive_frame.sky_anchors.map((a) => `"${a.label}"`).join(", ")}
- Include a causal sentence that uses the word "because".

Tone and intensity:
- Today’s intensity: ${intensity}.
- Use tone/word choice only; do NOT explain intensity, arcs, or phases.
${cues.length > 0 ? `- Helpful tone cues: ${cues.join(", ")}.` : ""}

Other rules:
- Address the listener (e.g., "you", "your", "today", "this moment").
- No greeting, no sign-off, no scaffold text.
- No meta narration or episode-structure commentary.
- No predictions, no advice/directives.
- Exactly two sentences; nothing more, nothing less.

Rewrite instructions to address:
${notes}
`.trim();
}

function countSentences(text: string): number {
  const sentences = text
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences.length;
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
  if (writing_contract.segment_key !== "intro" && word_count < min_words) {
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

