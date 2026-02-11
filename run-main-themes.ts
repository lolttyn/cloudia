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
import {
  extractPhaseNameFromFrame,
  mapPhaseNameToLunationLabel,
} from "./crew_cloudia/interpretation/lunationLabel.js";
import { supabase } from "./crew_cloudia/lib/supabaseClient.js";
import { RunSummaryCollector } from "./crew_cloudia/runner/phaseG/runSummaryCollector.js";
import type { PriorScripts } from "./crew_cloudia/runner/priorScripts.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

/** One-line teaching example (element/ruler) per sign for "teach don't assert" prompting. */
const SIGN_TEACHING_EXAMPLES: Record<string, string> = {
  aries: "Aries is a fire sign ruled by Mars — think initiative and quick response.",
  taurus: "Taurus is an earth sign ruled by Venus — think steadiness and sensory grounding.",
  gemini: "Gemini is an air sign ruled by Mercury — think curiosity and mental restlessness.",
  cancer: "Cancer is a water sign ruled by the Moon — think mood and what needs tending.",
  leo: "Leo is a fire sign ruled by the Sun — think visibility and heart-forward energy.",
  virgo: "Virgo is an earth sign ruled by Mercury — think refinement and useful detail.",
  libra: "Libra is an air sign ruled by Venus — think balance and relationship.",
  scorpio: "Scorpio is a water sign ruled by Pluto — think depth and what's under the surface.",
  sagittarius: "Sagittarius is a fire sign ruled by Jupiter — think big-picture optimism and restless curiosity.",
  capricorn: "Capricorn is an earth sign ruled by Saturn — think structure and steady progress.",
  aquarius: "Aquarius is an air sign ruled by Uranus — think detachment and sudden shifts.",
  pisces: "Pisces is a water sign ruled by Neptune — think softening and imagination.",
};

function getTeachingExampleForAnchor(label: string): string {
  const signMatch = label.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
  const sign = signMatch ? signMatch[1].toLowerCase() : null;
  return sign ? SIGN_TEACHING_EXAMPLES[sign] ?? "" : "";
}

// Sign sanitizer: remove sentences containing forbidden zodiac signs not in allowlist
function sanitizeForbiddenSigns(
  script: string,
  allowedSigns: string[]
): string {
  const zodiacSigns = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
  ];

  let sanitized = script;

  for (const sign of zodiacSigns) {
    const signLower = sign.toLowerCase();
    const allowed = allowedSigns.some(a => a.toLowerCase().includes(signLower));

    if (!allowed) {
      // Remove entire sentences containing the forbidden sign
      const sentenceWithSign = new RegExp(
        `[^.!?\\n]*\\b${sign}\\b[^.!?\\n]*[.!?]?`,
        "gi"
      );
      const before = sanitized;
      sanitized = sanitized.replace(sentenceWithSign, " ");
      if (before !== sanitized) {
        console.log(`[sanitize] Removed sentence(s) containing forbidden sign "${sign}"`);
      }
    }
  }

  // Clean up whitespace
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim();

  return sanitized;
}

function sanitizeMainThemes(script: string): string {
  const zodiacSigns = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ];
  const zodiacAbbr = [
    "ari", "tau", "gem", "can", "leo", "vir",
    "lib", "sco", "sag", "cap", "aqu", "pis",
  ];
  const signPattern = [...zodiacSigns, ...zodiacAbbr].join("|");

  const moonTransitSentence = new RegExp(
    `[^.!?\\n]*\\bmoon\\b[^.!?\\n]{0,80}\\b(in|into|entered|entering|moves into|moving into|moved into|shifted|slipped)\\b[^.!?\\n]{0,60}\\b(${signPattern})\\b[^.!?\\n]*[.!?]?`,
    "gi"
  );
  const moonFromToSentence = new RegExp(
    `[^.!?\\n]*\\bmoon\\b[^.!?\\n]{0,80}\\bfrom\\s+(${signPattern})\\s+to\\s+(${signPattern})\\b[^.!?\\n]*[.!?]?`,
    "gi"
  );
  const meaningOverMinutiaeSentence = /[^.!?\n]*meaning over minutiae[^.!?\n]*[.!?]?/gi;
  const adminSentence = /[^.!?\n]*\b(meeting|calendar|email|inbox|notification|app)\b[^.!?\n]*[.!?]?/gi;

  let sanitized = script;
  sanitized = sanitized.replace(moonTransitSentence, " ");
  sanitized = sanitized.replace(moonFromToSentence, " ");
  sanitized = sanitized.replace(meaningOverMinutiaeSentence, " ");
  sanitized = sanitized.replace(adminSentence, " ");

  sanitized = sanitized
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return sanitized.length > 0
    ? sanitized
    : "Today moves in a quieter rhythm, and you can let it be simple.";
}

function stripMoonTransitFromFrame(frame: InterpretiveFrame): InterpretiveFrame {
  const clone: any = JSON.parse(JSON.stringify(frame));
  const moonTransitPattern =
    /\bmoon\b[^.!?\n]{0,60}\b(in|into|entered|entering|moving into|moves into|moved into|shifted|slipped)\b/i;
  const moonInSignPattern =
    /\bmoon\b[^.!?\n]{0,60}\bin\s+(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i;

  if (Array.isArray(clone.sky_anchors)) {
    clone.sky_anchors = clone.sky_anchors.filter(
      (anchor: any) => !/^moon in\s+/i.test(anchor?.label ?? "")
    );
  }
  if (typeof clone.why_today_clause === "string") {
    if (moonTransitPattern.test(clone.why_today_clause) || moonInSignPattern.test(clone.why_today_clause)) {
      clone.why_today_clause = "";
    }
  }
  if (Array.isArray(clone.why_today)) {
    clone.why_today = clone.why_today.filter(
      (line: string) =>
        !moonTransitPattern.test(line) && !moonInSignPattern.test(line)
    );
  }
  if (Array.isArray(clone.causal_logic)) {
    clone.causal_logic = clone.causal_logic.filter(
      (line: string) =>
        !moonTransitPattern.test(line) && !moonInSignPattern.test(line)
    );
  }
  return clone as InterpretiveFrame;
}

function getLunationLabel(frame: InterpretiveFrame): string | null {
  const phaseName = extractPhaseNameFromFrame(frame);
  const result = mapPhaseNameToLunationLabel(phaseName);
  return result.isFallback ? null : result.label;
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
  
  // Repair NO_BEHAVIORAL_AFFORDANCE: use rotating closers (permission phrase, micro-action, reframe) so we don't repeat the same line daily
  if (blockingReasons.includes("NO_BEHAVIORAL_AFFORDANCE")) {
    const AFFORDANCE_MARKERS = [
      "you don't have to",
      "not today",
      "let this sit",
      "this isn't urgent",
      "take the space",
      "wait",
      "stop",
      "don't",
    ];
    const scriptLower = repaired.toLowerCase();
    const hasAffordance = AFFORDANCE_MARKERS.some((marker) => scriptLower.includes(marker));
    if (!hasAffordance) {
      const ROTATING_CLOSERS = [
        "You don't have to fix this today.",
        "Take the space you need.",
        "Let this sit if it needs to.",
        "It's okay to leave it for now.",
        "Not today—you can come back to it.",
      ];
      const episodeDate = interpretiveFrame?.date ?? new Date().toISOString().slice(0, 10);
      const index = episodeDate.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % ROTATING_CLOSERS.length;
      const affordanceSentence = ROTATING_CLOSERS[index];
      repaired = `${repaired.trim()}\n\n${affordanceSentence}`;
      needsRecheck = true;
      console.log(`[auto-repair] Added behavioral affordance (rotating): "${affordanceSentence}"`);
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
        // Inject anchor reference in first paragraph (prepend or after first sentence)
        const firstSentenceEnd = repaired.search(/[.!?]\s+/);
        if (firstSentenceEnd > 0 && firstSentenceEnd < 200) {
          // Insert after first sentence
          const anchorClause = ` — with ${anchor.label} setting the tone.`;
          repaired = repaired.slice(0, firstSentenceEnd + 1) + anchorClause + repaired.slice(firstSentenceEnd + 1);
        } else {
          // Prepend short anchor reference
          const anchorSentence = `Start from this: ${anchor.label}.`;
          repaired = `${anchorSentence}\n\n${repaired.trim()}`;
        }
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
  scripts_only?: boolean;
  force_regenerate?: boolean;
  /** Optional editorial direction (regeneration flow). Sanitized before prompt injection. */
  editorial_feedback?: string;
  /** Scripts from earlier this week for narrative arc continuity. */
  prior_scripts?: PriorScripts;
}): Promise<{
  segment_key: string;
  gate_result: ReturnType<typeof evaluateEditorialGate>;
  /** Set when gate approves; used by batch to accumulate prior_scripts for next date. */
  approved_script_text?: string;
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

  const phaseNameForPrompt = extractPhaseNameFromFrame(params.interpretive_frame);
  const lunationLabelResult = mapPhaseNameToLunationLabel(phaseNameForPrompt);
  const lunationLabelForPrompt = lunationLabelResult.label;
  const interpretiveFrameForPrompt = {
    ...params.interpretive_frame,
    lunation_context: { label: lunationLabelForPrompt },
  } as InterpretiveFrame & { lunation_context?: { label: string } };
  const interpretiveFrameForRewrite = stripMoonTransitFromFrame(
    interpretiveFrameForPrompt
  );

  const segmentConstraints = {
    ...baseConstraints,
    interpretive_frame: interpretiveFrameForPrompt,
    ...(params.editorial_feedback != null ? { editorial_feedback: params.editorial_feedback } : {}),
    ...(params.prior_scripts != null ? { prior_scripts: params.prior_scripts } : {}),
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

  if (params.force_regenerate) {
    console.log("[main_themes] force_regenerate enabled: bypassing idempotency guard");
  }

  // Idempotency guard: if latest attempt is already approved, return it immediately
  if (!params.force_regenerate) {
    const { data: latestAttempt, error: latestError } = await supabase
      .from("cloudia_segment_versions")
      .select("script_text, gate_decision, attempt_number")
      .eq("episode_id", params.episode_id)
      .eq("segment_key", "main_themes")
      .order("created_at", { ascending: false })
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
        
        // Still mark ready for audio if not in scripts-only mode (segment may have been marked before, but ensure it's marked)
        if (!params.scripts_only) {
          try {
            await markSegmentReadyForAudio({
              episode_id: params.episode_id,
              segment_key: "main_themes",
            });
          } catch (err: any) {
            // Log but don't fail - segment might already be marked or have validation issues
            console.warn(`[main_themes] Failed to mark ready for audio (idempotency path): ${err?.message ?? String(err)}`);
          }
        }
        
        return {
          segment_key: "main_themes",
          gate_result: gateResult,
          approved_script_text: latestAttempt.script_text,
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
  }

  let script = "";
  let previousScript = "";
  let rewriteInstructions: string[] = [];
  let approved = false;
  let lastDecision: EditorFeedback["decision"] | null = null;
  let finalAttemptNumber: number | null = null;

  // Get the base attempt number for this run (increments from previous runs)
  const baseAttemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: "main_themes",
  });
  console.log(`[main_themes] Starting generation with base attempt number: ${baseAttemptNumber} (will use attempts ${baseAttemptNumber} through ${baseAttemptNumber + MAX_SEGMENT_RETRIES - 1})`);
  console.log("[lunation-label]", {
    episode_date: params.episode_date,
    phase_name: lunationLabelResult.phase_name ?? null,
    derived_label: lunationLabelForPrompt,
    fallback: lunationLabelResult.isFallback,
  });

  for (let attempt = 0; attempt < MAX_SEGMENT_RETRIES; attempt++) {
    const attemptNumber = baseAttemptNumber + attempt;

    if (attempt === 0) {
      const draft = await generateSegmentDraft({
        episode_plan,
        segment,
        writing_contract,
        episode_validation,
      });
      script = sanitizeMainThemes(draft.draft_script);
      
      // DWU 14: Lunation coverage self-check with non-templated insertion
      if (params.interpretive_frame) {
        const scriptLower = script.toLowerCase();
        const requiredLabel = lunationLabelForPrompt;
        const hasLunation = scriptLower.includes(requiredLabel.toLowerCase());

        if (!hasLunation) {
          // Auto-inject lunation reference using random variant (non-templated)
          const lunationClauseVariants = [
            `, under the ${requiredLabel}`,
            `, anchored by the ${requiredLabel}`,
            `, with the ${requiredLabel} in the mix`,
            `, with the ${requiredLabel} overhead`,
            ` — the ${requiredLabel}`,
          ];

          const randomVariant =
            lunationClauseVariants[
              Math.floor(Math.random() * lunationClauseVariants.length)
            ];

          const firstSentenceEnd = script.search(/[.!?]\s+/);
          if (firstSentenceEnd > 0 && firstSentenceEnd < 200) {
            script =
              script.slice(0, firstSentenceEnd + 1) +
              randomVariant +
              script.slice(firstSentenceEnd + 1);
          } else {
            const insertPoint = Math.min(120, script.length);
            script =
              script.slice(0, insertPoint) +
              randomVariant +
              script.slice(insertPoint);
          }

          console.log(
            `[anchor-self-check] Auto-injected lunation reference: ${requiredLabel} (variant: ${randomVariant})`
          );
        }
      }
      
      previousScript = script; // Store for comparison in next iteration
    } else {
      // CRITICAL: This is a REVISION, not a retry
      // The writer must apply editor instructions to the previous draft
      const rewritePromptPayload = {
        system_prompt: "You are revising an existing draft based on editor feedback. Your job is to apply the requested changes, not to write a new draft from scratch.",
        user_prompt: buildShowrunnerRewritePrompt({
          interpretive_frame: interpretiveFrameForRewrite,
          previous_script: previousScript,
          editor_instructions: rewriteInstructions,
        }),
      };

      const rewriteResult = await invokeLLM(rewritePromptPayload, CLOUDIA_LLM_CONFIG);
      if (rewriteResult.status !== "ok") {
        throw new Error(
          `LLM rewrite failed (${rewriteResult.error_type}): ${rewriteResult.message}`
        );
      }

      const revisedScript = sanitizeMainThemes(rewriteResult.text.trim());

      // Hard check: ensure revision actually differs from previous attempt
      if (revisedScript.trim() === previousScript.trim()) {
        console.warn(
          `[main_themes] Attempt ${attemptNumber}: Revision identical to previous attempt. Forcing change.`
        );
        // We'll add NO_REVISION_MADE after evaluation
      }

      script = revisedScript;
    }

    // Final sanitize pass before evaluation (deterministic cleanup)
    script = sanitizeMainThemes(script);

    // Sign sanitizer: remove forbidden signs before evaluation
    const allowedSigns = params.interpretive_frame.sky_anchors.map(a => {
      const signMatch = a.label.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
      return signMatch ? signMatch[1].toLowerCase() : null;
    }).filter(Boolean) as string[];
    
    script = sanitizeForbiddenSigns(script, allowedSigns);

    // Word count validation for main_themes (enforce during generation, not just at mark-ready)
    // This prevents "scripts-only" runs from failing after approval due to short scripts
    const targetMinWords = Number(process.env.CLOUDIA_MAIN_THEMES_MIN_WORDS ?? "280");
    let wordCount = script.trim().split(/\s+/).filter((word) => word.length > 0).length;
    if (wordCount < targetMinWords) {
      console.warn(
        `[main_themes] Attempt ${attemptNumber}: Script has ${wordCount} words, minimum is ${targetMinWords}. Will request expansion.`
      );
      wordCount = script.trim().split(/\s+/).filter((word) => word.length > 0).length;
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
      episode_date: params.episode_date,
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
        episode_date: params.episode_date,
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
    const hasWordCountIssue = wordCount < targetMinWords;
    if (hasWordCountIssue) {
      allBlockingReasons.push(
        `word_count_below_min:${wordCount}<${targetMinWords} (targets ~110s audio at 150-170 wpm)`
      );
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
      finalAttemptNumber = attemptNumber;
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

    // PRIORITIZE word count expansion instruction when present
    if (hasWordCountIssue && attempt < MAX_SEGMENT_RETRIES - 1) {
      const expansionInstruction = `Expand the script to at least ${targetMinWords} words to meet minimum audio duration requirements. Add more detail, examples, or elaboration while maintaining the core message. Add 2-3 concrete lived moments and one additional emotional turn.`;
      // Put expansion instruction FIRST to prioritize it
      rewriteInstructions = [expansionInstruction, ...rewriteInstructions];
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
  // The attempt number is baseAttemptNumber + attempt, which was already persisted.

  if (gateResult.decision === "approve") {
    // Use the tracked final attempt number from the loop (the one that was approved)
    // If for some reason it's null, fall back to querying (shouldn't happen)
    const actualFinalAttempt = finalAttemptNumber ?? (await getNextAttemptNumber({
      episode_id: params.episode_id,
      segment_key: "main_themes",
    })) - 1;

    await upsertCurrentSegment({
      episode_id: params.episode_id,
      episode_date: params.episode_date,
      segment_key: "main_themes",
      script_text: script,
      script_version: actualFinalAttempt,
      gate_policy_version: gateResult.policy_version,
    });

    if (!params.scripts_only) {
      await markSegmentReadyForAudio({
        episode_id: params.episode_id,
        segment_key: "main_themes",
      });
    }

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
    ...(gateResult.decision === "approve" ? { approved_script_text: script } : {}),
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

  // Check if first instruction is about word count expansion
  const hasWordCountExpansion = params.editor_instructions.length > 0 && 
    params.editor_instructions[0].toLowerCase().includes("expand") &&
    params.editor_instructions[0].toLowerCase().includes("words");
  
  // Extract target word count if present
  const wordCountMatch = params.editor_instructions[0]?.match(/at least (\d+) words/i);
  const targetMinWords = wordCountMatch ? wordCountMatch[1] : null;

  const lengthRequirementBlock = hasWordCountExpansion && targetMinWords
    ? `**Length requirement (HARD):** Output **>= ${targetMinWords} words**. Do not shorten. If you add content, add **2–3 concrete lived moments** and **one additional emotional turn**.

`
    : "";

  return `
${PERMISSION_BLOCK}

You are REVISING an existing draft based on editor feedback. This is not a new draft—you must actively change the previous version.
${lengthRequirementBlock}Non-negotiable format requirement:
- Your revision MUST include at least one of these exact phrases (case-insensitive): "you don't have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", or "don't".
- These phrases can appear anywhere in your revision, but at least one MUST be present or the draft will be rejected.

Here is the previous draft:
---
${params.previous_script}
---

Your editor has requested the following changes:
${instructions}

CRITICAL: You MUST include at least one of these exact phrases somewhere in your revision: "you don't have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", or "don't". This is non-negotiable and will cause the draft to be rejected if missing.

Focus on translation, not explanation.

For each idea:
- show how it might show up in a real person's day
- offer one usable stance (act, wait, name, rest, adjust)

Avoid summarizing the day as a concept.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

Only reference celestial bodies that appear in the interpretive frame provided. Do not introduce planets, asteroids, or points that are not part of today's frame.

Required references (express naturally, not verbatim):
- The core tension: ${params.interpretive_frame.dominant_contrast_axis.primary} vs ${params.interpretive_frame.dominant_contrast_axis.counter} (express through lived experience, not as a named contrast)
${params.interpretive_frame.sky_anchors.map((a) => {
  const ex = getTeachingExampleForAnchor(a.label ?? "");
  return ex ? `- Sky anchor: ${a.label} (Example teaching moment: "${ex}")` : `- Sky anchor: ${a.label} (reference naturally, body + sign)`;
}).join("\n")}
- Why today matters: ${params.interpretive_frame.why_today_clause} (express naturally, not verbatim)

Continuity (weave into script naturally; do NOT output the labels "Yesterday:", "Tomorrow:", or "(none)" as literal text):
${params.interpretive_frame.continuity?.references_yesterday || params.interpretive_frame.continuity?.references_tomorrow
  ? [
      params.interpretive_frame.continuity?.references_yesterday && `- Yesterday: "${params.interpretive_frame.continuity.references_yesterday}"`,
      params.interpretive_frame.continuity?.references_tomorrow && `- Tomorrow: "${params.interpretive_frame.continuity.references_tomorrow}"`,
    ].filter(Boolean).join("\n")
  : "- No continuity callbacks for this episode."}

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
- **MANDATORY: Include at least one of these exact phrases: "you don't have to", "take the space", "let this sit", "not today", "this isn't urgent", "wait", "stop", or "don't". This phrase MUST appear in your revision or it will be rejected.**
- ${hasWordCountExpansion ? 'Avoid verbatim repetition where possible, **but do not sacrifice length**. Some structural reuse is allowed to meet minimum length.' : 'Do not repeat language from the previous version.'}
- Preserve what works; fix what doesn't.
- Preserve the dominant_contrast_axis meaning, but translate it into human experience.
- Include the specified sky anchors and causal logic using "because".
- If continuity lines are provided above, weave that content into the script naturally; do not output "(none)", "Yesterday:", or "Tomorrow:" as literal text.
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
