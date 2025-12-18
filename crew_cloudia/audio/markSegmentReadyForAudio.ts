import { supabase } from "../lib/supabaseClient";

export async function markSegmentReadyForAudio(params: {
  episode_id: string;
  segment_key: string;
}): Promise<void> {
  const { error } = await supabase
    .from("cloudia_segments")
    .update({ audio_status: "pending" })
    .eq("episode_id", params.episode_id)
    .eq("segment_key", params.segment_key);

  if (error) throw error;
}

