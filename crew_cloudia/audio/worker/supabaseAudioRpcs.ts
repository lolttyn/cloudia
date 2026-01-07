import { supabase } from "../../lib/supabaseClient";

export async function rpcClaimPendingSegment(params: {
  episodeId: string;
  segmentKey: string;
  jobKey: string;
}) {
  const { data, error } = await supabase.rpc("audio_claim_pending_segment", {
    p_episode_id: params.episodeId,
    p_segment_key: params.segmentKey,
    p_job_key: params.jobKey,
  });

  if (error) throw error;
  // data is a rowset with one row (per our RPC)
  return Array.isArray(data) ? data[0] : data;
}

export async function rpcMarkReady(params: {
  episodeId: string;
  segmentKey: string;
  jobKey: string;
  audioStoragePath: string;
  durationSeconds: number;
  checksumSha256?: string | null;
  codec?: string | null;
  sampleRateHz?: number | null;
}) {
  const { error } = await supabase.rpc("audio_mark_ready", {
    p_episode_id: params.episodeId,
    p_segment_key: params.segmentKey,
    p_job_key: params.jobKey,
    p_audio_storage_path: params.audioStoragePath,
    p_audio_duration_seconds: params.durationSeconds,
    p_checksum_sha256: params.checksumSha256 ?? null,
    p_codec: params.codec ?? null,
    p_sample_rate_hz: params.sampleRateHz ?? null,
  });

  if (error) throw error;
}

export async function rpcMarkFailed(params: {
  episodeId: string;
  segmentKey: string;
  jobKey: string;
  errorClass: string;
  errorMessage: string;
}) {
  const { error } = await supabase.rpc("audio_mark_failed", {
    p_episode_id: params.episodeId,
    p_segment_key: params.segmentKey,
    p_job_key: params.jobKey,
    p_error_class: params.errorClass,
    p_error_message: params.errorMessage,
  });

  if (error) throw error;
}

