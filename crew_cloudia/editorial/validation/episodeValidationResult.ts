import { SegmentValidationResult } from "./segmentValidationResult.js";
import { LexicalFatigueEvaluation } from "./lexicalFatigue.js";

export type EpisodeValidationResult = {
  episode_date: string;
  is_valid: boolean;

  segment_results: SegmentValidationResult[];
  lexical_fatigue: {
    segment_key: SegmentValidationResult["segment_key"];
    evaluation: LexicalFatigueEvaluation;
  }[];

  blocking_segments: {
    segment_key: SegmentValidationResult["segment_key"];
    reasons: string[];
  }[];

  warnings: {
    segment_key: SegmentValidationResult["segment_key"];
    warnings: string[];
  }[];
};

