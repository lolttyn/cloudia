import { SegmentPromptInput } from "../contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "./episodeValidationResult.js";
import { SegmentValidationResult } from "./segmentValidationResult.js";
import {
  FATIGUE_BLOCK,
  FATIGUE_REWRITE,
  FATIGUE_WARNING,
  evaluateLexicalFatigue,
} from "./lexicalFatigue.js";
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

export async function validateEpisodeEligibility(
  episode_date: string,
  segments: SegmentPromptInput[],
  options?: {
    lexicalFatigueFetcher?: Parameters<typeof evaluateLexicalFatigue>[0]["fetcher"];
    window_days?: number;
  }
): Promise<EpisodeValidationResult> {
  ensureNonEmptySegments(segments);
  ensureNoDuplicateKeys(segments);

  const segment_results = segments.map((segment) => validateSegmentEligibility(segment));

  const blockingSegmentsMap = new Map<SegmentValidationResult["segment_key"], string[]>();
  const warningsMap = new Map<SegmentValidationResult["segment_key"], string[]>();

  for (const result of segment_results) {
    if (!result.is_valid) {
      blockingSegmentsMap.set(result.segment_key, [...result.blocking_reasons]);
    }
    if (result.warnings.length > 0) {
      warningsMap.set(result.segment_key, [...result.warnings]);
    }
  }

  const lexical_fatigue: EpisodeValidationResult["lexical_fatigue"] = [];

  for (const segment of segments) {
    if (!segment.script_text || segment.script_text.trim().length === 0) {
      continue;
    }

    const evaluation = await evaluateLexicalFatigue({
      episode_date,
      segment_key: segment.segment_key,
      script_text: segment.script_text,
      fetcher: options?.lexicalFatigueFetcher,
      window_days: options?.window_days,
    });

    lexical_fatigue.push({
      segment_key: segment.segment_key,
      evaluation,
    });

    if (evaluation.severity === "block") {
      const reasons = blockingSegmentsMap.get(segment.segment_key) ?? [];
      reasons.push(
        `lexical_fatigue_block: score ${evaluation.result.score} (threshold ${FATIGUE_BLOCK})`
      );
      blockingSegmentsMap.set(segment.segment_key, reasons);
    }

    if (evaluation.instructions.length > 0) {
      const warnings = warningsMap.get(segment.segment_key) ?? [];
      if (evaluation.severity === "rewrite") {
        warnings.push(
          `lexical_fatigue_rewrite_required: score ${evaluation.result.score} (threshold ${FATIGUE_REWRITE})`
        );
      } else if (evaluation.severity === "warning") {
        warnings.push(
          `lexical_fatigue_warning: score ${evaluation.result.score} (threshold ${FATIGUE_WARNING})`
        );
      }
      warnings.push(...evaluation.instructions);
      warningsMap.set(segment.segment_key, warnings);
    }
  }

  const blocking_segments = segments
    .map((segment) => {
      const reasons = blockingSegmentsMap.get(segment.segment_key) ?? [];
      if (reasons.length === 0) return null;
      return {
        segment_key: segment.segment_key,
        reasons,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const warnings = segments
    .map((segment) => {
      const warningList = warningsMap.get(segment.segment_key) ?? [];
      if (warningList.length === 0) return null;
      return {
        segment_key: segment.segment_key,
        warnings: warningList,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const is_valid = blocking_segments.length === 0;

  return {
    episode_date,
    is_valid,
    segment_results,
    lexical_fatigue,
    blocking_segments,
    warnings,
  };
}
