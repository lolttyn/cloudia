export interface EpisodeGateInput {
  episode_id: string;
  episode_date: string; // YYYY-MM-DD
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

  if (input.time_context === "day_of") {
    const failed = input.segment_results.filter((s) => s.decision === "block");

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
  }

  return {
    decision: "ship",
    failed_segments: [],
    policy_version: input.policy_version,
    evaluated_at: evaluatedAt
  };
}

