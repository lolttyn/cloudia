import { supabase } from "../../lib/supabaseClient";
import { EditorialGateResult } from "./evaluateEditorialGate";

export async function persistEditorialGateResult(params: {
  episode_id: string;
  episode_date: string; // YYYY-MM-DD
  segment_key: string;
  gate_result: EditorialGateResult;
}): Promise<void> {
  const { error } = await supabase.from("editorial_gate_results").insert({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: params.segment_key,
    decision: params.gate_result.decision,
    is_approved: params.gate_result.is_approved,
    blocking_reasons: params.gate_result.blocking_reasons,
    warnings: params.gate_result.warnings,
    rewrite_instructions: params.gate_result.rewrite_instructions ?? null,
    policy_version: params.gate_result.policy_version,
    evaluated_at: params.gate_result.evaluated_at
  });

  if (error) {
    throw error;
  }
}

