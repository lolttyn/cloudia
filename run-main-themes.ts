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
import { evaluateSegmentWithFrame } from "./crew_cloudia/editorial/showrunner/evaluateSegmentWithFrame.js";

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

const MAX_EDITOR_RETRIES = 5;

export async function runMainThemesForDate(params: {
  program_slug: string;
  episode_date: string;
  episode_id: string;
  batch_id: string;
  time_context: "day_of" | "future";
  interpretive_frame?: InterpretiveFrame;
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
    blocking_segments: [],
    warnings: [],
  };

  const today = new Date().toISOString().slice(0, 10);
  const time_context = params.time_context ?? (params.episode_date === today ? "day_of" : "future");
  const writing_contract = getWritingContract("main_themes");

  let script = "";
  let editorNotes: string[] = [];
  let approved = false;
  let lastDecision: "APPROVE" | "REVISE" | "FAIL_EPISODE" | null = null;

  for (let attempt = 0; attempt < MAX_EDITOR_RETRIES; attempt++) {
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
        system_prompt: "You are a precise editorial rewrite assistant.",
        user_prompt: buildShowrunnerRewritePrompt({
          interpretive_frame: params.interpretive_frame,
          previous_script: script,
          editor_notes: editorNotes,
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

    const evaluation = evaluateSegmentWithFrame({
      interpretive_frame: params.interpretive_frame,
      segment_key: "main_themes",
      draft_script: script,
      attempt,
      max_attempts: MAX_EDITOR_RETRIES,
    });

    lastDecision = evaluation.decision;
    if (evaluation.decision === "APPROVE") {
      approved = true;
      break;
    }

    if (evaluation.decision === "FAIL_EPISODE" || attempt === MAX_EDITOR_RETRIES - 1) {
      throw new Error(
        `Episode failed: main_themes could not meet editor rubric after ${attempt + 1} attempts. Notes: ${evaluation.notes.join(
          " | "
        )}`
      );
    }

    editorNotes = evaluation.notes;
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

  const attemptNumber = await getNextAttemptNumber({
    episode_id: params.episode_id,
    segment_key: "main_themes",
  });

  await persistSegmentVersion({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: "main_themes",
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
      segment_key: "main_themes",
      script_text: script,
      script_version: attemptNumber,
      gate_policy_version: gateResult.policy_version,
    });

    await markSegmentReadyForAudio({
      episode_id: params.episode_id,
      segment_key: "main_themes",
    });
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
  editor_notes: string[];
}): string {
  const notes =
    params.editor_notes.length > 0
      ? params.editor_notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "No notes provided.";

  return `
You are rewriting a main_themes segment to satisfy the editor rubric. Fix only the cited issues.

Authoritative interpretive frame:
${JSON.stringify(params.interpretive_frame, null, 2)}

Required explicit references (must appear verbatim in the output):
- "${params.interpretive_frame.dominant_contrast_axis.statement}"
${params.interpretive_frame.sky_anchors.map((a) => `- "${a.label}"`).join("\n")}
- "${params.interpretive_frame.why_today_clause}"

You must output the following structure exactly, filling in content beneath each heading. Do not remove, rename, or reorder these headings:

**Primary Meanings**
(write here)

**Relevance**
(write here)

**Concrete Example**
(write here)

**Confidence Alignment**
(write here)

Editor notes to address:
${notes}

Previous draft:
${params.previous_script}

Requirements:
- Preserve the dominant_contrast_axis and meaning from the interpretive frame.
- Include the specified sky anchors and causal logic using "because".
- Keep required sections and headings intact.
- Match the frame's confidence_level; do not increase certainty.
- Do not add new themes; fix only the listed issues.
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

