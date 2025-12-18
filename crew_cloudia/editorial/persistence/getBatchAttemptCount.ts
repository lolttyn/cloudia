import { supabase } from "../../lib/supabaseClient";

export async function getBatchAttemptCount(params: {
  episode_id: string;
  segment_key: string;
  batch_id: string;
}): Promise<number> {
  const { count, error } = await supabase
    .from("cloudia_segment_versions")
    .select("*", { count: "exact", head: true })
    .eq("episode_id", params.episode_id)
    .eq("segment_key", params.segment_key)
    .eq("batch_id", params.batch_id);

  if (error) throw error;
  return count ?? 0;
}

