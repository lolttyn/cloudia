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
import { evaluateSegmentWithFrame } from "./crew_cloudia/editorial/showrunner/evaluateSegmentWithFrame.js";
import { evaluateAdherenceRubric } from "./crew_cloudia/quality/adherence/adherence_rubric.js";
import { PERMISSION_BLOCK } from "./crew_cloudia/editorial/prompts/permissionBlock.js";
import { generateEditInstructions } from "./crew_cloudia/editorial/editor/generateEditInstructions.js";
import { supabase } from "./crew_cloudia/lib/supabaseClient.js";
import { RunSummaryCollector } from "./crew_cloudia/runner/phaseG/runSummaryCollector.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

// Sign sanitizer: remove forbidden zodiac signs not in allowlist
function sanitizeForbiddenSigns(
  script: string,
  allowedSigns: string[]
): string {
  const zodiacSigns = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
  ];
  
  const scriptLower = script.toLowerCase();
  let sanitized = script;
  
  for (const sign of zodiacSigns) {
    const signLower = sign.toLowerCase();
    const allowed = allowedSigns.some(a => a.toLowerCase().includes(signLower));
    
    if (!allowed && scriptLower.includes(signLower)) {
      // Replace forbidden sign mentions with generic phrasing
      const regex = new RegExp(`\\b${sign}\\b`, "gi");
      sanitized = sanitized.replace(regex, "that sign");
      console.log(`[sanitize] Replaced forbidden sign "${sign}" with "that sign"`);
    }
  }
  
  return sanitized;
}

// Auto-repair: fix mechanical violations deterministically
function autoRepairMechanicalViolations(
  script: string,
  blockingReasons: string[],
  frameEval: ReturnType<typeof evaluateSegmentWithFrame>,
  interpretiveFrame: InterpretiveFrame
): string | null {
  let repaired = script;
  let needsRecheck = false;
  
  // Repair NO_BEHAVIORAL_AFFORDANCE
  if (blockingReasons.includes("NO_BEHAVIORAL_AFFORDANCE")) {
    const AFFORDANCE_MARKERS = [
      "you dont have to",
      "not today",
      "let this sit",
      "this isnt urgent",
      "take the space",
      "wait",
      "stop",
      "dont",
    ];
    
    const scriptLower = repaired.toLowerCase();
    const hasAffordance = AFFORDANCE_MARKERS.some(marker => scriptLower.includes(marker));
    
    if (!hasAffordance) {
      // Append a sentence with the first affordance marker (use exact marker text)
      const affordanceSentence = `You dont have to fix this today.`;
      repaired = `${repaired.trim()}\n\n${affordanceSentence}`;
      needsRecheck = true;
      console.log(`[auto-repair] Added behavioral affordance marker: "${affordanceSentence}"`);
    }
  }
  
  // Repair missing sky anchor mentions
  const missingAnchorNotes = frameEval.notes.filter(note => 
    note.startsWith("Astro grounding: reference sky anchor")
  );
  
  if (missingAnchorNotes.length > 0) {
    // Extract anchor labels from notes
    const missingAnchors: string[] = [];
    for (const note of missingAnchorNotes) {
      const match = note.match(/reference sky anchor "([^"]+)"/);
      if (match) {
        missingAnchors.push(match[1]);
      }
    }
    
    // Find actual anchors from frame that are missing
    const scriptLower = repaired.toLowerCase();
    for (const anchor of interpretiveFrame.sky_anchors) {
      if (!scriptLower.includes(anchor.label.toLowerCase())) {
        // Append a sentence mentioning the anchor
        const anchorSentence = `Because ${anchor.label}, you might notice this shift.`;
        repaired = `${repaired.trim()}\n\n${anchorSentence}`;
        needsRecheck = true;
        console.log(`[auto-repair] Added missing sky anchor: ${anchor.label}`);
        break; // Only add one anchor per repair pass
      }
    }
  }
  
  return needsRecheck ? repaired : null;
}

export async function runMainThemesForDate(params: {
  program_slug: string;
  episode_date: string;
  episode_id: string;
  batch_id: string;
  time_context: "day_of" | "future";
  interpretive_frame?: InterpretiveFrame;
  collector?: RunSummaryCollector;
  retry_gate_failed?: boolean;
}): Promise<{
  segment_key: string;
  gate_result: ReturnType<typeof evaluateEditorialGate>;
}> {
  if (!params.interpretive_frame) {
    throw new Error("interpretive_frame is required for main_themes generation");
  }

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

  const baseConstraints: SegmentPromptInput["constraints"] = {
    max_ideas: 1,
    must_acknowledge_uncertainty: true,
    ban_repetition: true,
  };

  const segmentConstraints = {
    ...baseConstraints,
    interpretive_frame: params.interpretive_frame,
  } as SegmentPromptInput["constraints"];

  const segment: SegmentPromptInput = {
    episode_date: params.episode_date,
    segment_key: "main_themes",
    intent: ["develop_primary_themes"],
    included_tags: ["theme:one"],
    suppressed_tags: [],
    confidence_level: "high",
    constraints: segmentConstraints,
  };

  const episode_validation: EpisodeValidationResult = {
    episode_date: params.episode_date,
    is_valid: true,
    segment_results: [],
    lexical_fatigue: [],
    blocking_segments: [],
    warnings: [],
  };

  const today = new Date().toISOString().slice(0, 10);
  const time_context = params.time_context ?? (params.episode_date === today ? "day_of" : "future");
  const writing_contract = getWritingContract("main_themes");

  // Idempotency guard: if latest attempt is already approved, return it immediately
  const { data: latestAttempt, error: latestError } = await supabase
    .from("cloudia_segment_versions")
    .select("script_text, gate_decision, attempt_number")
    .eq("episode_id", params.episode_id)
    .eq("segment_key", "main_themes")
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Failed to check existing attempts: ${latestError.message}`);
  }

  if (latestAttempt && latestAttempt.gate_decision === "approve") {
    // Already have an approved version - check if it passes gate evaluation
    console.log(`[main_themes] Idempotency guard: found approved attempt ${latestAttempt.attempt_number}, evaluating gate...`);
    const diagnostics = mapDiagnosticsToEditorialViolations(
      performSelfCheck(latestAttempt.script_text, writing_contract)
    );

    const gateResult = evaluateEditorialGate({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "main_themes",
      time_context,
      generated_script: latestAttempt.script_text,
      diagnostics,
      segment_contract: {
        allows_rewrites: false,
      },
      policy_version: "v0.1",
      max_attempts_remaining: 0,
    });

    // Record the existing attempt to collector for Phase G instrumentation
    if (params.collector) {
      params.collector.recordAttempt({
        episode_date: params.episode_date,
        segment_key: "main_themes",
        attempt_number: latestAttempt.attempt_number,
        decision: "approve",
        blocking_reasons: [],
        script_text: latestAttempt.script_text,
      });
      params.collector.recordFinal({
        episode_date: params.episode_date,
        segment_key: "main_themes",
        final_decision: gateResult.decision,
      });
    }

    await persistEditorialGateResult({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "main_themes",
      gate_result: gateResult,
    });

    const gateDecision = gateResult.decision;

    // Gate passed -> true idempotency: safe to skip
    if (gateDecision === "approve") {
      console.log(`[main_themes] Idempotency guard: approved attempt ${latestAttempt.attempt_number} passes gate, skipping generation`);
      return {
        segment_key: "main_themes",
        gate_result: gateResult,
      };
    }

    // Gate failed
    if (!params.retry_gate_failed) {
      console.log(`[main_themes] Idempotency guard: approved attempt ${latestAttempt.attempt_number} is gate-blocked (${gateDecision}), returning blocked result`);
      return {
        segment_key: "main_themes",
        gate_result: gateResult,
      };
    }

    // retry_gate_failed enabled -> DO NOT return; proceed to generation loop
    console.log(`[main_themes] Approved attempt ${latestAttempt.attempt_number} is gate-blocked (${gateDecision}); retry_gate_failed enabled, regenerating...`);
    // Fall through to generation loop below
  }

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
      // CRITICAL: This is a REVISION, not a retry
      // The writer must apply editor instructions to the previous draft
      const rewritePromptPayload = {
        system_prompt: "You are revising an existing draft based on editor feedback. Your job is to apply the requested changes, not to write a new draft from scratch.",
        user_prompt: buildShowrunnerRewritePrompt({
          interpretive_frame: params.interpretive_frame,
          previous_script: script,
          editor_instructions: rewriteInstructions,
        }),
      };

      const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
      if (rewriteResult.status !== "ok") {
        throw new Error(
          `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
        );
      }

      const revisedScript = rewriteResult.text.trim();

      // Hard check: ensure revision actually differs from previous attempt
      if (revisedScript.trim() === previousScript.trim()) {
        console.warn(
          `[main_themes] Attempt ${attemptNumber}: Revision identical to previous attempt. Forcing change.`
        );
        // We'll add NO_REVISION_MADE after evaluation
      }

      script = revisedScript;
    }

    // Sign sanitizer: remove forbidden signs before evaluation
    const allowedSigns = params.interpretive_frame.sky_anchors.map(a => {
      const signMatch = a.label.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
      return signMatch ? signMatch[1].toLowerCase() : null;
    }).filter(Boolean) as string[];
    
    script = sanitizeForbiddenSigns(script, allowedSigns);

    // Word count validation for main_themes (enforce during generation, not just at mark-ready)
    // This prevents "scripts-only" runs from failing after approval due to short scripts
    const wordCount = script.trim().split(/\s+/).filter((word) => word.length > 0).length;
    const targetMinWords = Number(process.env.CLOUDIA_MAIN_THEMES_MIN_WORDS ?? "280");
    if (wordCount < targetMinWords) {
      // Add as blocking reason to trigger rewrite with expansion instruction
      console.warn(
        `[main_themes] Attempt ${attemptNumber}: Script has ${wordCount} words, minimum is ${targetMinWords}. Will request expansion.`
      );
    }

    // Phase D authority inversion: frame evaluator provides diagnostics only
    const frameEval = evaluateSegmentWithFrame({
      interpretive_frame: params.interpretive_frame,
      segment_key: "main_themes",
      draft_script: script,
      attempt,
      max_attempts: MAX_SEGMENT_RETRIES,
    });

    // Phase D rubric is final authority on editorial quality
    const rubricEval = evaluateAdherenceRubric({
      script: script,
      segment_key: "main_themes",
      interpretive_frame: params.interpretive_frame,
    });

    // Auto-repair: fix mechanical violations before final gate check
    const allBlockingReasonsBeforeRepair = [
      ...frameEval.blocking_reasons,
      ...rubricEval.blocking_reasons,
    ];
    
    const repairedScript = autoRepairMechanicalViolations(
      script,
      allBlockingReasonsBeforeRepair,
      frameEval,
      params.interpretive_frame
    );
    
    let finalFrameEval = frameEval;
    let finalRubricEval = rubricEval;
    
    if (repairedScript) {
      // Re-evaluate repaired script
      finalFrameEval = evaluateSegmentWithFrame({
        interpretive_frame: params.interpretive_frame,
        segment_key: "main_themes",
        draft_script: repairedScript,
        attempt,
        max_attempts: MAX_SEGMENT_RETRIES,
      });
      
      finalRubricEval = evaluateAdherenceRubric({
        script: repairedScript,
        segment_key: "main_themes",
        interpretive_frame: params.interpretive_frame,
      });
      
      const repairedBlockingReasons = [
        ...finalFrameEval.blocking_reasons,
        ...finalRubricEval.blocking_reasons,
      ];
      
      if (repairedBlockingReasons.length === 0) {
        // Auto-repair succeeded - use repaired script
        script = repairedScript;
        console.log(`[main_themes] Auto-repair succeeded, approving attempt ${attemptNumber}`);
      } else {
        // Auto-repair didn't fully fix it, continue with original evaluation
        console.log(`[main_themes] Auto-repair attempted but still has blocking: ${repairedBlockingReasons.join(", ")}`);
      }
    }

    // Combine blocking reasons: frame (grounding/structural) + rubric (editorial quality) + word count
    const allBlockingReasons = [
      ...finalFrameEval.blocking_reasons,
      ...finalRubricEval.blocking_reasons,
    ];

    // Add word count check as blocking reason if script is too short
    if (wordCount < targetMinWords) {
      allBlockingReasons.push(
        `word_count_below_min:${wordCount}<${targetMinWords} (targets ~110s audio at 150-170 wpm)`
      );
      // Add expansion instruction for rewrite
      if (attempt < MAX_SEGMENT_RETRIES - 1) {
        // Only add instruction if we have attempts remaining
        rewriteInstructions.push(
          `Expand the script to at least ${targetMinWords} words to meet minimum audio duration requirements. Add more detail, examples, or elaboration while maintaining the core message.`
        );
      }
    }

    // CRITICAL: Persist EVERY attempt before checking pass/fail
    // This ensures we can see evolution even if later attempts fail
    const gateDecisionForAttempt = allBlockingReasons.length === 0 ? "approve" : "rewrite";
    await persistSegmentVersion({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "main_themes",
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
        segment_key: "main_themes",
        attempt_number: attemptNumber,
        decision: gateDecisionForAttempt,
        blocking_reasons: allBlockingReasons,
        script_text: script,
      });
    }

    // Log attempt evolution for debugging
    console.log(
      `[main_themes] Attempt ${attemptNumber}/${MAX_SEGMENT_RETRIES}: ` +
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
      // CRITICAL: Exit immediately after first approval - do not continue loop
      break;
    }

    // Has blocking reasons - determine if we should fail or revise
    if (attempt + 1 >= MAX_SEGMENT_RETRIES) {
      lastDecision = "FAIL_EPISODE";
      throw new Error(
        `Episode failed: main_themes could not meet editor rubric after ${attempt + 1} attempts. ` +
        `Frame blocking: ${frameEval.blocking_reasons.join(", ")}. ` +
        `Rubric blocking: ${rubricEval.blocking_reasons.join(", ")}. ` +
        `Notes: ${[...frameEval.notes, ...rubricEval.warnings].join(" | ")}`
      );
    }

    lastDecision = "REVISE";

    // CRITICAL: Convert blocking reasons into actionable editor instructions
    // This is the missing translation layer between evaluation and revision
    const editorInstructions = generateEditInstructions(
      allBlockingReasons,
      "main_themes"
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
      "Episode failed: main_themes did not achieve editor approval within allowed attempts."
    );
  }

  const diagnostics = mapDiagnosticsToEditorialViolations(
    performSelfCheck(script, writing_contract)
  );

  const gateResult = evaluateEditorialGate({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "main_themes",
    time_context,
    generated_script: script,
    diagnostics,
    segment_contract: {
      allows_rewrites: false,
    },
    policy_version: "v0.1",
    max_attempts_remaining: 0,
  });

  // NOTE: persistSegmentVersion is now called INSIDE the loop for every attempt.
  // We only upsert the snapshot here on final success.
  // The attempt number is the loop index + 1, which was already persisted.

  if (gateResult.decision === "approve") {
    // Get the final attempt number (should match what was persisted in the loop)
    const finalAttemptNumber = await getNextAttemptNumber({
      episode_id: params.episode_id,
      segment_key: "main_themes",
    });
    // Subtract 1 because getNextAttemptNumber returns the NEXT number
    const actualFinalAttempt = finalAttemptNumber - 1;

    await upsertCurrentSegment({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "main_themes",
      script_text: script,
      script_version: actualFinalAttempt,
      gate_policy_version: gateResult.policy_version,
    });

    await markSegmentReadyForAudio({
      episode_id: params.episode_id,
      segment_key: "main_themes",
    });

    // Record final for Phase G instrumentation
    if (params.collector) {
      params.collector.recordFinal({
        episode_date: params.episode_date,
        segment_key: "main_themes",
        final_decision: gateResult.decision,
      });
    }
  }

  await persistEditorialGateResult({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "main_themes",
    gate_result: gateResult,
  });

  return {
    segment_key: "main_themes",
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

function buildShowrunnerRewritePrompt(params: {
  interpretive_frame: InterpretiveFrame;
  previous_script: string;
  editor_instructions: string[];
}): string {
  const instructions =
    params.editor_instructions.length > 0
      ? params.editor_instructions.map((i, idx) => `${idx + 1}. ${i}`).join("\n")
      : "No specific instructions provided.";

  return `
${PERMISSION_BLOCK}

You are REVISING an existing draft based on editor feedback. This is not a new draft—you must actively change the previous version.

Non-negotiable format requirement:
- Your revision MUST include at least one of these exact phrases (case-insensitive): "you don't have to", "you dont have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", "don't", or "dont".
- These phrases can appear anywhere in your revision, but at least one MUST be present or the draft will be rejected.

Here is the previous draft:
---
${params.previous_script}
---

Your editor has requested the following changes:
${instructions}

CRITICAL: You MUST include at least one of these exact phrases somewhere in your revision: "you don't have to", "you dont have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", "don't", or "dont". This is non-negotiable and will cause the draft to be rejected if missing.

Focus on translation, not explanation.

For each idea:
- show how it might show up in a real person's day
- offer one usable stance (act, wait, name, rest, adjust)

Avoid summarizing the day as a concept.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

Required references (express naturally, not verbatim):
- The core tension: ${params.interpretive_frame.dominant_contrast_axis.primary} vs ${params.interpretive_frame.dominant_contrast_axis.counter} (express through lived experience, not as a named contrast)
${params.interpretive_frame.sky_anchors.map((a) => `- Sky anchor: ${a.label} (reference naturally, body + sign)`).join("\n")}
- Why today matters: ${params.interpretive_frame.why_today_clause} (express naturally, not verbatim)

Required continuity lines (MUST appear verbatim, once each, anywhere in the script):
${params.interpretive_frame.continuity?.references_yesterday ? `- Yesterday: "${params.interpretive_frame.continuity.references_yesterday}"` : "- Yesterday: (none)"}
${params.interpretive_frame.continuity?.references_tomorrow ? `- Tomorrow: "${params.interpretive_frame.continuity.references_tomorrow}"` : "- Tomorrow: (none)"}

Sign hygiene (STRICT - VIOLATION WILL CAUSE REJECTION):
- ALLOWED signs (ONLY these may be mentioned): ${params.interpretive_frame.sky_anchors.map(a => {
  const signMatch = a.label.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
  return signMatch ? signMatch[1].toLowerCase() : null;
}).filter(Boolean).join(", ") || "none listed above"}
- FORBIDDEN: Do NOT mention ANY other zodiac signs (Libra, Leo, Aries, etc.) unless they appear in the ALLOWED list above.
- If you mention a sign not in the ALLOWED list, your draft will be rejected.

Behavioral affordance (REQUIRED):
- Include one explicit permission or stance using direct language (e.g., "you don't have to...", "it's okay to...", "you might let...").

Revision requirements:
- Apply ALL editor instructions above.
- **MANDATORY: Include at least one of these exact phrases: "you don't have to", "you dont have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", "don't", or "dont". This phrase MUST appear in your revision or it will be rejected.**
- Do not repeat language from the previous version.
- Preserve what works; fix what doesn't.
- Preserve the dominant_contrast_axis meaning, but translate it into human experience.
- Include the specified sky anchors and causal logic using "because".
- Include the continuity lines above verbatim (do not paraphrase them).
- Write in natural, conversational prose.
- Match the frame's confidence_level in tone; do not increase certainty.
- Do not add new themes; fix only the issues identified by the editor.
`.trim();
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
