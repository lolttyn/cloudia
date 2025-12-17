import { SegmentValidationResult } from "./segmentValidationResult.js";

export type EpisodeValidationResult = {
  episode_date: string;
  is_valid: boolean;

  segment_results: SegmentValidationResult[];

  blocking_segments: {
    segment_key: SegmentValidationResult["segment_key"];
    reasons: string[];
  }[];

  warnings: {
    segment_key: SegmentValidationResult["segment_key"];
    warnings: string[];
  }[];
};


