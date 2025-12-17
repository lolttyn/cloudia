import { supabase } from "../../lib/supabaseClient";
import { EpisodeGateResult } from "./evaluateEpisodeGate";

export async function persistEpisodeGateResult(params: {
  episode_id: string;
  episode_date: string;
  gate_result: EpisodeGateResult;
}): Promise<void> {
  const { error } = await supabase.from("editorial_episode_gate_results").insert({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    decision: params.gate_result.decision,
    failed_segments: params.gate_result.failed_segments,
    policy_version: params.gate_result.policy_version,
    evaluated_at: params.gate_result.evaluated_at
  });

  if (error) {
    throw error;
  }
}

