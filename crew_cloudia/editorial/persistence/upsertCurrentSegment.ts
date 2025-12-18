import { supabase } from "../../lib/supabaseClient";

export async function upsertCurrentSegment(params: {
  episode_id: string;
  episode_date: string;
  segment_key: string;
  script_text: string;
  script_version: number;
  gate_policy_version: string;
}): Promise<void> {
  const { error } = await supabase
    .from("cloudia_segments")
    .upsert(
      {
        episode_id: params.episode_id,
        episode_date: params.episode_date,
        segment_key: params.segment_key,
        script_text: params.script_text,
        script_version: params.script_version,
        gate_decision: "approve",
        gate_policy_version: params.gate_policy_version,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "episode_id,segment_key"
      }
    );

  if (error) throw error;
}

