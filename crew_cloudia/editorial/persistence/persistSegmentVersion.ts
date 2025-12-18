import { supabase } from "../../lib/supabaseClient";

export async function persistSegmentVersion(params: {
  episode_id: string;
  episode_date: string;
  segment_key: string;
  attempt_number: number;
  script_text: string;
  gate_decision: "approve" | "block" | "rewrite";
  blocking_reasons: string[];
  gate_policy_version: string;
  batch_id: string;
}): Promise<void> {
  const { error } = await supabase.from("cloudia_segment_versions").insert({
    episode_id: params.episode_id,
    episode_date: params.episode_date,
    segment_key: params.segment_key,
    attempt_number: params.attempt_number,
    script_text: params.script_text,
    gate_decision: params.gate_decision,
    blocking_reasons: params.blocking_reasons,
    gate_policy_version: params.gate_policy_version,
    batch_id: params.batch_id
  });

  if (error) throw error;
}

