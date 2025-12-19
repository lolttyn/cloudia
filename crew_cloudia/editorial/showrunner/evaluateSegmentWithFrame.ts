import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";

export function evaluateSegmentWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  segment_key: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
}): EditorFeedback {
  const notes: string[] = [];
  const rewrite_instructions: string[] = [];
  const scriptLower = params.draft_script.toLowerCase();
  const frame = params.interpretive_frame;

  // Temporal enforcement
  if (!scriptLower.includes(frame.temporal_phase.toLowerCase())) {
    const msg = `Temporal awareness: reference the temporal phase "${frame.temporal_phase}".`;
    notes.push(msg);
    rewrite_instructions.push(msg);
  }
  if (!scriptLower.includes(frame.intensity_modifier.toLowerCase())) {
    const msg = `Temporal awareness: include the intensity modifier "${frame.intensity_modifier}".`;
    notes.push(msg);
    rewrite_instructions.push(msg);
  }
  if (frame.temporal_arc.arc_day_index > 1) {
    const mustHook =
      (frame.continuity.references_yesterday &&
        scriptLower.includes(frame.continuity.references_yesterday.toLowerCase())) ||
      (frame.continuity.references_tomorrow &&
        scriptLower.includes(frame.continuity.references_tomorrow.toLowerCase()));
    if (!mustHook) {
      const msg = "Continuity: include at least one provided continuity hook for this arc day.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }
  if (frame.continuity.references_yesterday) {
    const hook = frame.continuity.references_yesterday.toLowerCase();
    if (!scriptLower.includes(hook)) {
      const msg = "Continuity: include the yesterday hook from the frame.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }
  if (frame.continuity.references_tomorrow) {
    const hook = frame.continuity.references_tomorrow.toLowerCase();
    if (!scriptLower.includes(hook)) {
      const msg = "Continuity: include the tomorrow hook from the frame.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }

  // Hard gate: meaning fidelity (axis present, no substitution)
  if (!scriptLower.includes(frame.dominant_contrast_axis.statement.toLowerCase())) {
    notes.push(
      `Meaning fidelity: include the dominant axis "${frame.dominant_contrast_axis.statement}".`
    );
    rewrite_instructions.push(
      `Insert the dominant axis verbatim: "${frame.dominant_contrast_axis.statement}".`
    );
  }

  // Hard gate: astrological grounding (sky anchors + because + anchor tie)
  for (const anchor of frame.sky_anchors) {
    if (!scriptLower.includes(anchor.label.toLowerCase())) {
      const msg = `Astro grounding: reference sky anchor "${anchor.label}".`;
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }

  if (!/\bbecause\b/i.test(params.draft_script)) {
    const msg = 'Astro grounding: include causal logic with the word "because".';
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  // Hard gate: section contract compliance — headings present and tied
  const requiredHeadings = [
    { key: "primary meanings", requirement: "state the dominant_contrast_axis explicitly" },
    { key: "relevance", requirement: "explain causal_logic and why_today" },
    { key: "concrete example", requirement: "make the experiential pressure tangible" },
    { key: "confidence alignment", requirement: "mirror the frame confidence_level" },
  ];

  for (const heading of requiredHeadings) {
    if (!scriptLower.includes(heading.key)) {
      notes.push(`Section: missing required heading "${heading.key}".`);
      rewrite_instructions.push(
        `Add the required heading "${heading.key}" and fulfill its ${heading.requirement}.`
      );
    }
  }

  // Soft/hard: tie why_today and causal_logic presence
  const hasWhyTodayMarker =
    frame.why_today.some((w) => scriptLower.includes(w.toLowerCase())) ||
    scriptLower.includes(frame.why_today_clause.toLowerCase());
  if (!hasWhyTodayMarker) {
    const msg = "Relevance: explain why today using the frame's why_today / clause.";
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  // Confidence alignment: ensure frame confidence_level is mirrored
  if (!scriptLower.includes(frame.confidence_level.toLowerCase())) {
    const msg = `Confidence alignment: reflect the frame confidence_level "${frame.confidence_level}".`;
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  if (notes.length === 0) {
    return { decision: "APPROVE", notes, blocking_reasons: [], rewrite_instructions: [] };
  }

  const nextDecision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";

  return { decision: nextDecision, notes, blocking_reasons: [...notes], rewrite_instructions };
}
