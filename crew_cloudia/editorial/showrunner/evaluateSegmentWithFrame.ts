import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

type EditorDecision = "APPROVE" | "REVISE" | "FAIL_EPISODE";

export function evaluateSegmentWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  segment_key: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
}): {
  decision: EditorDecision;
  notes: string[];
} {
  const notes: string[] = [];
  const scriptLower = params.draft_script.toLowerCase();
  const frame = params.interpretive_frame;

  // Hard gate: meaning fidelity (axis present, no substitution)
  if (!scriptLower.includes(frame.dominant_contrast_axis.statement.toLowerCase())) {
    notes.push(
      `Meaning fidelity: include the dominant axis "${frame.dominant_contrast_axis.statement}".`
    );
  }

  // Hard gate: astrological grounding (sky anchors + because + anchor tie)
  for (const anchor of frame.sky_anchors) {
    if (!scriptLower.includes(anchor.label.toLowerCase())) {
      notes.push(`Astro grounding: reference sky anchor "${anchor.label}".`);
    }
  }

  if (!/\bbecause\b/i.test(params.draft_script)) {
    notes.push('Astro grounding: include causal logic with the word "because".');
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
    }
  }

  // Soft/hard: tie why_today and causal_logic presence
  const hasWhyTodayMarker =
    frame.why_today.some((w) => scriptLower.includes(w.toLowerCase())) ||
    scriptLower.includes(frame.why_today_clause.toLowerCase());
  if (!hasWhyTodayMarker) {
    notes.push("Relevance: explain why today using the frame's why_today / clause.");
  }

  // Confidence alignment: ensure frame confidence_level is mirrored
  if (!scriptLower.includes(frame.confidence_level.toLowerCase())) {
    notes.push(
      `Confidence alignment: reflect the frame confidence_level "${frame.confidence_level}".`
    );
  }

  if (notes.length === 0) {
    return { decision: "APPROVE", notes };
  }

  const nextDecision: EditorDecision =
    params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";

  return { decision: nextDecision, notes };
}


