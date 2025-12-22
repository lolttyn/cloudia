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
import { evaluateAdherenceRubric } from "./crew_cloudia/quality/adherence/adherence_rubric.js";
import { PERMISSION_BLOCK } from "./crew_cloudia/editorial/prompts/permissionBlock.js";
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
  let previousBlockingReasons: string[] = [];
  let approved = false;
  let lastDecision: EditorFeedback["decision"] | null = null;

  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    const attemptNumber = attempt + 1;
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
        sky_anchors: params.interpretive_frame.sky_anchors,
      });

      script = `${scaffold}\n\n${expressiveText}`;
    }

    // Frame evaluator provides diagnostics (structural/grounding checks)
    const frameEval = evaluateIntroWithFrame({
      interpretive_frame: params.interpretive_frame,
      episode_date: params.episode_date,
      draft_script: script,
      attempt,
      max_attempts: MAX_SEGMENT_RETRIES,
    });

    // Phase D rubric is final authority on editorial quality
    const rubricEval = evaluateAdherenceRubric({
      script: script,
      segment_key: "intro",
      interpretive_frame: params.interpretive_frame,
    });

    // Combine blocking reasons: frame (structural) + rubric (editorial quality)
    const allBlockingReasons = [
      ...frameEval.blocking_reasons,
      ...rubricEval.blocking_reasons,
    ];

    // CRITICAL: Persist EVERY attempt before checking pass/fail
    const gateDecisionForAttempt = allBlockingReasons.length === 0 ? "approve" : "rewrite";
    await persistSegmentVersion({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "intro",
      attempt_number: attemptNumber,
      script_text: script,
      gate_decision: gateDecisionForAttempt,
      blocking_reasons: allBlockingReasons,
      gate_policy_version: "v0.1",
      batch_id: params.batch_id,
    });

    // Log attempt evolution for debugging
    console.log(
      `[intro] Attempt ${attemptNumber}/${MAX_SEGMENT_RETRIES}: ` +
      `blocking=${allBlockingReasons.length}, ` +
      `preview="${script.substring(0, 120).replace(/\n/g, " ")}..."`
    );
    if (allBlockingReasons.length > 0) {
      console.log(`  Blocking reasons: ${allBlockingReasons.join(", ")}`);
    }

    // Final decision: only approve if BOTH evaluators have zero blocking reasons
    const hasBlockingReasons = allBlockingReasons.length > 0;

    if (!hasBlockingReasons) {
      // Both evaluators pass - approve
      approved = true;
      lastDecision = "APPROVE";
      break;
    }

    // Has blocking reasons - determine if we should fail or revise
    if (attempt + 1 >= MAX_SEGMENT_RETRIES) {
      lastDecision = "FAIL_EPISODE";
      throw new Error(
        `Episode failed: intro did not meet editor rubric after ${attempt + 1} attempts. ` +
        `Frame blocking: ${frameEval.blocking_reasons.join(", ")}. ` +
        `Rubric blocking: ${rubricEval.blocking_reasons.join(", ")}. ` +
        `Notes: ${[...frameEval.notes, ...Array.from(rubricEval.warnings)].join(" | ")}`
      );
    }

    lastDecision = "REVISE";

    // Store blocking reasons for next rewrite attempt
    previousBlockingReasons = allBlockingReasons;

    // Combine rewrite instructions from both evaluators
    rewriteInstructions = [
      ...frameEval.rewrite_instructions,
      ...(rubricEval.blocking_reasons.length > 0
        ? [`Phase D rubric violations: ${rubricEval.blocking_reasons.join(", ")}`]
        : []),
    ];

    // If no specific rewrite instructions, use notes
    if (rewriteInstructions.length === 0) {
      rewriteInstructions = [...frameEval.notes, ...Array.from(rubricEval.warnings)];
    }
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

  // NOTE: persistSegmentVersion is now called INSIDE the loop for every attempt.
  // We only upsert the snapshot here on final success.

  if (gateResult.decision === "approve") {
    // Get the final attempt number (should match what was persisted in the loop)
    const finalAttemptNumber = await getNextAttemptNumber({
      episode_id: params.episode_id,
      segment_key: "intro",
    });
    // Subtract 1 because getNextAttemptNumber returns the NEXT number
    const actualFinalAttempt = finalAttemptNumber - 1;

    await upsertCurrentSegment({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "intro",
      script_text: script,
      script_version: actualFinalAttempt,
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
${PERMISSION_BLOCK}

You are rewriting ONLY the two expressive sentences of the intro. The scaffold (greeting + axis line + why-today clause) is locked and will be inserted by the system. You must NOT include the greeting, scaffold lines, or sign-off. Return EXACTLY TWO sentences, plain text only.

Begin with an experiential entry point:
how the day meets someone emotionally, physically, or situationally.

Safeguard A — Entry Vector Assertion:
If your opening sentence could describe any day, rewrite it.

Safeguard B — One-Sentence Cap on "Aboutness":
You may include at most one sentence that describes what the day is about. Everything else should show how it shows up.

If a lunation is present, lead with how it feels or what is opening/closing,
not with astronomical sequencing.

Authoritative interpretive frame (context only, do not restate as scaffold):
${JSON.stringify(params.interpretive_frame, null, 2)}

Required explicit references (must appear verbatim in your two sentences):
- At least one sky anchor from: ${params.interpretive_frame.sky_anchors.map((a) => `"${a.label}"`).join(", ")}
- Include a causal sentence that uses the word "because".

Tone and intensity:
- Today's intensity: ${intensity}.
- Use tone/word choice to convey this; do NOT explain intensity, arcs, or phases.
${cues.length > 0 ? `- Helpful tone cues: ${cues.join(", ")}.` : ""}

Write in a conversational, grounded voice.

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

