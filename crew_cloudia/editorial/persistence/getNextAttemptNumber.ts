import { supabase } from "../../lib/supabaseClient";

export async function getNextAttemptNumber(params: {
  episode_id: string;
  segment_key: string;
}): Promise<number> {
  const { data, error } = await supabase
    .from("cloudia_segment_versions")
    .select("attempt_number")
    .eq("episode_id", params.episode_id)
    .eq("segment_key", params.segment_key)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) return 1;

  return data.attempt_number + 1;
}

