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
import { generateEditInstructions } from "./crew_cloudia/editorial/editor/generateEditInstructions.js";
import { createHash } from "crypto";
import { buildIntroScaffold } from "./crew_cloudia/generation/introScaffold.js";
import { invokeLLM, CLOUDIA_LLM_CONFIG } from "./crew_cloudia/generation/invokeLLM.js";
import { RunSummaryCollector } from "./crew_cloudia/runner/phaseG/runSummaryCollector.js";

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
  collector?: RunSummaryCollector;
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
    lexical_fatigue: [],
    blocking_segments: [],
    warnings: [],
  };

  const writing_contract = getWritingContract("intro");

  let script = "";
  let previousScript = "";
  let rewriteInstructions: string[] = [];
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
      previousScript = script; // Store for comparison in next iteration
    } else {
      // CRITICAL: Pass the FULL intro script to the writer, not just the expressive portion
      // The rubric evaluates the entire intro, so we must revise the entire intro
      console.log(`[intro] Rewriting attempt ${attemptNumber}. Previous full script length: ${script.length} chars`);
      
      const rewritePromptPayload = {
        system_prompt: "You are revising an existing draft based on editor feedback. You may rewrite, remove, or replace any part of the previous draft, including the opening. Your job is to apply the requested changes to the entire intro, not to preserve any specific structure.",
        user_prompt: buildIntroFullRewritePrompt({
          interpretive_frame: params.interpretive_frame,
          previous_script: script,
          editor_instructions: rewriteInstructions,
          episode_date: params.episode_date,
        }),
      };
      
      const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
      if (rewriteResult.status !== "ok") {
        throw new Error(
          `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
        );
      }

      const revisedScript = rewriteResult.text.trim();
      console.log(`[intro] Rewrite returned full script (${revisedScript.length} chars). New hash: ${createHash("md5").update(revisedScript).digest("hex").substring(0, 8)}`);

      // Hard check: ensure revision actually differs from previous attempt
      if (revisedScript.trim() === previousScript.trim()) {
        console.warn(
          `[intro] Attempt ${attemptNumber}: Revision identical to previous attempt. Forcing change.`
        );
        // We'll add NO_REVISION_MADE after evaluation
      }

      script = revisedScript;
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

    // Hard check: if revision is identical, add blocking reason
    if (attempt > 0 && script.trim() === previousScript.trim()) {
      allBlockingReasons.push("NO_REVISION_MADE");
    }

    // Record attempt for Phase G instrumentation
    if (params.collector) {
      params.collector.recordAttempt({
        episode_date: params.episode_date,
        segment_key: "intro",
        attempt_number: attemptNumber,
        decision: gateDecisionForAttempt,
        blocking_reasons: allBlockingReasons,
        script_text: script,
      });
    }

    // CRITICAL DIAGNOSTIC: Hash the script to verify it's changing
    const scriptHash = createHash("md5").update(script).digest("hex").substring(0, 8);
    
    // Log attempt evolution for debugging
    console.log(
      `[intro] Attempt ${attemptNumber}/${MAX_SEGMENT_RETRIES}: ` +
      `blocking=${allBlockingReasons.length}, ` +
      `hash=${scriptHash}, ` +
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

    // CRITICAL: Convert blocking reasons into actionable editor instructions
    const editorInstructions = generateEditInstructions(
      allBlockingReasons,
      "intro"
    );

    // Log editor instructions for observability
    if (editorInstructions.length > 0) {
      console.log(`  Editor instructions: ${editorInstructions.join(" | ")}`);
    }

    // Combine frame evaluator notes with editor instructions
    rewriteInstructions = [
      ...frameEval.rewrite_instructions,
      ...editorInstructions,
    ];

    // If no specific rewrite instructions, use notes
    if (rewriteInstructions.length === 0) {
      rewriteInstructions = [...frameEval.notes, ...Array.from(rubricEval.warnings)];
    }

    // Store current script for next iteration's comparison
    previousScript = script;
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

    // Record final for Phase G instrumentation
    if (params.collector) {
      params.collector.recordFinal({
        episode_date: params.episode_date,
        segment_key: "intro",
        final_attempt_number: actualFinalAttempt,
        final_decision: gateResult.decision,
      });
    }
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

function buildIntroFullRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  previous_script: string;
  editor_instructions: string[];
  episode_date: string;
}) {
  const instructions =
    params.editor_instructions.length > 0
      ? params.editor_instructions.map((i, idx) => `${idx + 1}. ${i}`).join("\n")
      : "No specific instructions provided.";

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

You are REVISING the entire intro based on editor feedback. You may rewrite, remove, or replace any part of the previous draft, including the opening.

Here is the previous full intro:
---
${params.previous_script}
---

Your editor has requested the following changes:
${instructions}

CRITICAL: You must include:
- A greeting that names the date (use: ${expectedIntroGreeting(params.episode_date)})
- The dominant contrast axis meaning: "${params.interpretive_frame.dominant_contrast_axis.statement}" (but translate it into human experience, don't use the phrase verbatim)
- The why-today clause: "${params.interpretive_frame.why_today_clause}"
- At least one sky anchor from: ${params.interpretive_frame.sky_anchors.map((a) => `"${a.label}"`).join(", ")}
- A causal sentence that uses the word "because"
- Exactly two expressive sentences at the end

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

Tone and intensity:
- Today's intensity: ${intensity}.
- Use tone/word choice to convey this; do NOT explain intensity, arcs, or phases.
${cues.length > 0 ? `- Helpful tone cues: ${cues.join(", ")}.` : ""}

Revision requirements:
- Apply ALL editor instructions above.
- You may rewrite the opening, middle, or ending - whatever needs fixing.
- Remove any banned phrases or abstract scaffolding entirely.
- Do not repeat language from the previous version.
- Preserve what works; fix what doesn't.
- Write in a conversational, grounded voice.
- Return the COMPLETE revised intro, not just a portion.
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
