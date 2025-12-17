export type SegmentValidationResult = {
  segment_key: "intro" | "main_themes" | "reflection" | "closing";
  is_valid: boolean;
  blocking_reasons: string[];
  warnings: string[];
};


