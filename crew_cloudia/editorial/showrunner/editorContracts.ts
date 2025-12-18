export type EditorDecision = "APPROVE" | "REVISE" | "FAIL_EPISODE";

export type EditorFeedback = {
  decision: EditorDecision;
  notes: string[];
  blocking_reasons: string[];
  rewrite_instructions: string[];
};

export const MAX_SEGMENT_RETRIES = 5;

