// Quality thresholds are uniform across all episode dates.
// No date-based branching remains in quality logic.
export const EPISODE_QUALITY_THRESHOLD = 0.9;

export interface EpisodeGateInput {
  episode_id: string;
  episode_date: string; // YYYY-MM-DD
  // NOTE: time_context kept for backwards compatibility but no longer used for quality decisions
  time_context: "day_of" | "future";

  segment_results: {
    segment_key: string;
    decision: "approve" | "block" | "rewrite";
    blocking_reasons: string[];
  }[];

  policy_version: string;
}

export interface EpisodeGateResult {
  decision: "ship" | "fail";
  failed_segments: {
    segment_key: string;
    blocking_reasons: string[];
  }[];

  policy_version: string;
  evaluated_at: string;
}

export function evaluateEpisodeGate(
  input: EpisodeGateInput
): EpisodeGateResult {
  const evaluatedAt = new Date().toISOString();

  // Quality thresholds are uniform across all episode dates.
  // No date-based branching remains in quality logic.
  // All episodes must meet the same quality standards regardless of date.
  // 
  // ASSERTION: No logic in this function should branch on input.time_context or input.episode_date.
  // If any segment fails validation (block) or exhausts rewrites (still rewrite after max attempts),
  // the episode fails. Note: segments typically throw errors on failure, but we handle
  // non-approve decisions defensively here.
  const failed = input.segment_results.filter((s) => s.decision !== "approve");

  if (failed.length > 0) {
    return {
      decision: "fail",
      failed_segments: failed.map((s) => ({
        segment_key: s.segment_key,
        blocking_reasons: s.blocking_reasons
      })),
      policy_version: input.policy_version,
      evaluated_at: evaluatedAt
    };
  }

  return {
    decision: "ship",
    failed_segments: [],
    policy_version: input.policy_version,
    evaluated_at: evaluatedAt
  };
}

