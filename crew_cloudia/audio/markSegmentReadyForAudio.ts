import "dotenv/config";
import { supabase } from "../lib/supabaseClient";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Validate script length before marking ready for audio.
 * 
 * For main_themes, enforce minimum word count that correlates to target audio duration.
 * This prevents audio QA failures downstream.
 * 
 * Heuristic: ~150-170 words per minute for spoken audio.
 * Target: 110s minimum → ~275-310 words minimum.
 * We use 280 words as a conservative threshold.
 */
function validateScriptLengthForAudio(segmentKey: string, scriptText: string): void {
  if (!scriptText || typeof scriptText !== "string") {
    throw new Error(`Script text is empty or invalid for ${segmentKey}`);
  }

  const wordCount = scriptText.trim().split(/\s+/).filter((word) => word.length > 0).length;

  // For main_themes, enforce word count that correlates to target audio duration
  // This is upstream enforcement to prevent audio QA failures
  if (segmentKey === "main_themes") {
    // Target: ~110s audio at 150-170 wpm = ~275-310 words
    // Use 280 words as conservative threshold (configurable via env)
    const targetMinWords = Number(process.env.CLOUDIA_MAIN_THEMES_MIN_WORDS ?? "280");
    
    if (wordCount < targetMinWords) {
      throw new Error(
        `main_themes script has ${wordCount} words, minimum is ${targetMinWords} ` +
        `(targets ~110s audio at 150-170 wpm). Script too short for audio generation.`
      );
    }
  }

  // Other segments use existing qaScriptWordCount thresholds (checked in worker)
  // We don't enforce here to avoid duplicate checks
}

export async function markSegmentReadyForAudio(params: {
  episode_id: string;
  segment_key: string;
}): Promise<void> {
  const ttsVoiceId = requireEnv("CLOUDIA_TTS_VOICE_ID");
  const ttsModelId = requireEnv("CLOUDIA_TTS_MODEL_ID");

  // Fetch script_text to validate length before marking pending
  const { data: segment, error: fetchError } = await supabase
    .from("cloudia_segments")
    .select("script_text")
    .eq("episode_id", params.episode_id)
    .eq("segment_key", params.segment_key)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch segment: ${fetchError.message}`);
  }

  if (!segment) {
    throw new Error(`Segment not found: ${params.episode_id}/${params.segment_key}`);
  }

  const scriptText = segment.script_text as string | null;
  if (!scriptText) {
    throw new Error(`Segment has no script_text: ${params.episode_id}/${params.segment_key}`);
  }

  // Validate script length (upstream enforcement for main_themes)
  validateScriptLengthForAudio(params.segment_key, scriptText);

  // Mark as pending (script length validated)
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

