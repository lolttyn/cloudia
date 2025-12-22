import "dotenv/config";

import { createHash } from "crypto";

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
import { evaluateAdherenceRubric } from "./crew_cloudia/quality/adherence/adherence_rubric.js";
import { PERMISSION_BLOCK } from "./crew_cloudia/editorial/prompts/permissionBlock.js";
import { generateEditInstructions } from "./crew_cloudia/editorial/editor/generateEditInstructions.js";
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
  let previousScript = "";
  let rewriteInstructions: string[] = [];
  let approved = false;
  let lastDecision: EditorFeedback["decision"] | null = null;

  let scaffold = "";
  let signoff = "";
  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    const attemptNumber = attempt + 1;
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
      previousScript = script; // Store for comparison in next iteration
    } else {
      // CRITICAL: Pass the FULL closing script to the writer, not just the micro-reflection
      // The rubric evaluates the entire closing, so we must revise the entire closing
      console.log(`[closing] Rewriting attempt ${attemptNumber}. Previous full script length: ${script.length} chars`);
      
      const rewritePromptPayload = {
        system_prompt: "You are revising an existing draft based on editor feedback. You may rewrite, remove, or replace any part of the previous closing, including the opening. Your job is to apply the requested changes to the entire closing, not to preserve any specific structure.",
        user_prompt: buildClosingFullRewritePrompt({
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
      console.log(`[closing] Rewrite returned full script (${revisedScript.length} chars). New hash: ${createHash("md5").update(revisedScript).digest("hex").substring(0, 8)}`);

      // Post-rewrite guard: enforce sentence count compression
      const sentenceCount = revisedScript.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
      if (sentenceCount > 3) {
        console.warn(`[closing] Attempt ${attemptNumber}: Closing too long (${sentenceCount} sentences). Will be flagged in evaluation.`);
        // The evaluation will catch this and add blocking reason for next attempt
      }

      script = revisedScript;

      // Hard check: ensure revision actually differs from previous attempt
      if (revisedScript.trim() === previousScript.trim()) {
        console.warn(
          `[closing] Attempt ${attemptNumber}: Revision identical to previous attempt. Forcing change.`
        );
        // We'll add NO_REVISION_MADE after evaluation
      }

      script = revisedScript;
    }

    // Frame evaluator provides diagnostics (structural/grounding checks)
    const frameEval = evaluateClosingWithFrame({
      interpretive_frame: params.interpretive_frame,
      episode_date: params.episode_date,
      draft_script: script,
      attempt,
      max_attempts: MAX_SEGMENT_RETRIES,
      scaffold,
      signoff,
    });

    // Check for scaffold bugs first (these are code bugs, not rewrite issues)
    const hasScaffoldBug =
      frameEval.blocking_reasons.includes("closing:scaffold_missing") ||
      frameEval.blocking_reasons.includes("closing:signoff_missing");

    if (hasScaffoldBug) {
      throw new Error(
        `Closing scaffold/sign-off missing or altered; this is a code bug, not a rewrite issue. Notes: ${frameEval.notes.join(
          " | "
        )}`
      );
    }

    // Phase D rubric is final authority on editorial quality
    // NOTE: previous_closings not yet available in this context; repetition check will be skipped
    const rubricEval = evaluateAdherenceRubric({
      script: script,
      segment_key: "closing",
      interpretive_frame: params.interpretive_frame,
      previous_closings: undefined, // TODO: fetch previous closings for repetition check
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
      segment_key: "closing",
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

    // Log attempt evolution for debugging
    console.log(
      `[closing] Attempt ${attemptNumber}/${MAX_SEGMENT_RETRIES}: ` +
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
        `Episode failed: closing could not meet editor rubric after ${attempt + 1} attempts. ` +
        `Frame blocking: ${frameEval.blocking_reasons.join(", ")}. ` +
        `Rubric blocking: ${rubricEval.blocking_reasons.join(", ")}. ` +
        `Notes: ${[...frameEval.notes, ...Array.from(rubricEval.warnings)].join(" | ")}`
      );
    }

    lastDecision = "REVISE";

    // CRITICAL: Convert blocking reasons into actionable editor instructions
    const editorInstructions = generateEditInstructions(
      allBlockingReasons,
      "closing"
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
      "Episode failed: closing did not achieve editor approval within allowed attempts."
    );
  }

  // Phase D: Removed legacy assembly invariant - rubric approval is authoritative
  // The closing structure is now flexible and validated semantically, not structurally
  // assertClosingAssemblyInvariant(script, scaffold, signoff);

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

  // NOTE: persistSegmentVersion is now called INSIDE the loop for every attempt.
  // We only upsert the snapshot here on final success.

  if (gateResult.decision === "approve") {
    // Get the final attempt number (should match what was persisted in the loop)
    const finalAttemptNumber = await getNextAttemptNumber({
      episode_id: params.episode_id,
      segment_key: "closing",
    });
    // Subtract 1 because getNextAttemptNumber returns the NEXT number
    const actualFinalAttempt = finalAttemptNumber - 1;

    await upsertCurrentSegment({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "closing",
      script_text: script,
      script_version: actualFinalAttempt,
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

function buildClosingFullRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  previous_script: string;
  editor_instructions: string[];
  episode_date: string;
}) {
  const instructions =
    params.editor_instructions.length > 0
      ? params.editor_instructions.map((i, idx) => `${idx + 1}. ${i}`).join("\n")
      : "No specific instructions provided.";

  const axis = params.interpretive_frame.dominant_contrast_axis;
  const timingNote =
    params.interpretive_frame.timing?.notes ?? params.interpretive_frame.timing?.state;

  return `
${PERMISSION_BLOCK}

You are REVISING the entire closing based on editor feedback. You may rewrite, remove, or replace any part of the previous closing, including the opening.

Here is the previous full closing:
---
${params.previous_script}
---

Your editor has requested the following changes:
${instructions}

CRITICAL: You must include (express naturally, not verbatim):
- The day's core tension: ${axis.primary} vs ${axis.counter} (express through lived experience, not as a named contrast like "meaning over minutiae")
- A timing note if provided: ${timingNote || "none"} (express naturally)
- The temporal phase: ${params.interpretive_frame.temporal_phase} (express through tone, not by naming it)
- A natural sign-off that feels human
- At least 1-3 reflective sentences that invite integration or permission

End with integration, not summary.

The closing must include one gentle permission or release, expressed as optional and present-tense (not advice, not prediction).

You may:
- reflect the day back in human terms
- offer permission to stop, rest, or notice
- leave something unresolved
- invite reflection on where the day's energy showed up

Do not restate earlier language.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

CLOSING SHAPE CONSTRAINTS (NON-NEGOTIABLE):

- Write a SHORT closing: exactly 1–3 sentences total.
- Do NOT give advice, instructions, or guidance.
- Do NOT tell the listener what to do.
- This is an observational reflection, not a takeaway.
- Begin with how the day is *settling or integrating* emotionally.
- If a lunation is referenced, it must appear in the first sentence or be felt implicitly.
- End with a natural sense of closure or release (no calls to action).

Revision requirements:
- Apply ALL editor instructions above.
- You may rewrite the opening, middle, or ending - whatever needs fixing.
- Remove any banned phrases or abstract scaffolding entirely.
- Do not repeat language from the previous version.
- Preserve what works; fix what doesn't.
- Reflective and observational; no advice, no directives, no "you should".
- Express the core tension (${axis.primary} vs ${axis.counter}) through lived experience, not as a named contrast.
- No predictions; stay with today.
- Return the COMPLETE revised closing, not just a portion.
- CRITICAL: Keep it to 1-3 sentences total. If you wrote more, cut it down.
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

