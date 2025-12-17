import { SegmentPromptInput } from "../contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "./episodeValidationResult.js";
import { SegmentValidationResult } from "./segmentValidationResult.js";
import { validateSegmentEligibility } from "./validateSegmentEligibility.js";

const ensureNonEmptySegments = (segments: SegmentPromptInput[]): void => {
  if (segments.length === 0) {
    throw new Error("validateEpisodeEligibility requires at least one segment");
  }
};

const ensureNoDuplicateKeys = (segments: SegmentPromptInput[]): void => {
  const seen = new Set<SegmentValidationResult["segment_key"]>();
  for (const segment of segments) {
    if (seen.has(segment.segment_key)) {
      throw new Error(`duplicate segment_key detected: ${segment.segment_key}`);
    }
    seen.add(segment.segment_key);
  }
};

export function validateEpisodeEligibility(
  episode_date: string,
  segments: SegmentPromptInput[]
): EpisodeValidationResult {
  ensureNonEmptySegments(segments);
  ensureNoDuplicateKeys(segments);

  const segment_results = segments.map((segment) => validateSegmentEligibility(segment));

  const blocking_segments = segment_results
    .filter((result) => !result.is_valid)
    .map((result) => ({
      segment_key: result.segment_key,
      reasons: result.blocking_reasons,
    }));

  const warnings = segment_results
    .filter((result) => result.warnings.length > 0)
    .map((result) => ({
      segment_key: result.segment_key,
      warnings: result.warnings,
    }));

  const is_valid = blocking_segments.length === 0;

  return {
    episode_date,
    is_valid,
    segment_results,
    blocking_segments,
    warnings,
  };
}


