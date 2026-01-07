import "dotenv/config";
import { supabase } from "../lib/supabaseClient";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export async function markSegmentReadyForAudio(params: {
  episode_id: string;
  segment_key: string;
}): Promise<void> {
  const ttsVoiceId = requireEnv("CLOUDIA_TTS_VOICE_ID");
  const ttsModelId = requireEnv("CLOUDIA_TTS_MODEL_ID");

  const { error } = await supabase
    .from("cloudia_segments")
    .update({
      audio_status: "pending",
      tts_voice_id: ttsVoiceId,
      tts_model_id: ttsModelId,
    })
    .eq("episode_id", params.episode_id)
    .eq("segment_key", params.segment_key);

  if (error) throw error;
}

