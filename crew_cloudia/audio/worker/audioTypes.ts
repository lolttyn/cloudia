export type AudioStatus = "pending" | "generating" | "ready" | "failed";

export type SegmentKey = "intro" | "main_themes" | "closing" | string;

export type PendingSegmentRow = {
  episode_id: string;
  segment_key: string;
  episode_date: string; // YYYY-MM-DD
  script_version: number;
  script_text: string;
  tts_voice_id: string | null;
  tts_model_id: string | null;
  audio_status: AudioStatus | null;
};

