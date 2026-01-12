import { supabase } from "../../lib/supabaseClient";
import { buildEpisodeAudioStoragePath } from "./buildEpisodeAudioStoragePath.js";

export type EpisodeAudioReadinessError = {
  type: "missing_segments" | "not_ready" | "missing_episode_mp3";
  details: {
    missing?: string[];
    notReady?: Array<{ segment_key: string; status: string | null }>;
    episodePath?: string;
  };
};

/**
 * Assert that an episode is ready for publishing (all segments ready + episode MP3 exists).
 * 
 * Throws a typed error if not ready, with actionable details.
 */
export async function assertEpisodeAudioReady(params: {
  episodeDate: string; // YYYY-MM-DD
  programSlug?: string;
  requiredSegments?: string[]; // Defaults to ["intro", "main_themes", "closing"]
}): Promise<void> {
  const {
    episodeDate,
    programSlug,
    requiredSegments = ["intro", "main_themes", "closing"],
  } = params;

  // Check segment readiness
  const { data: segments, error: segmentsError } = await supabase
    .from("cloudia_segments")
    .select("segment_key, audio_status, audio_storage_path")
    .eq("episode_date", episodeDate)
    .in("segment_key", requiredSegments);

  if (segmentsError) {
    throw new Error(`Failed to query segments: ${segmentsError.message}`);
  }

  const segmentMap = new Map<string, typeof segments[0]>();
  for (const row of segments || []) {
    segmentMap.set(row.segment_key as string, row);
  }

  const missing: string[] = [];
  const notReady: Array<{ segment_key: string; status: string | null }> = [];

  for (const segmentKey of requiredSegments) {
    const segment = segmentMap.get(segmentKey);

    if (!segment) {
      missing.push(segmentKey);
      continue;
    }

    const status = segment.audio_status as string | null;
    if (status !== "ready") {
      notReady.push({ segment_key: segmentKey, status });
      continue;
    }

    const storagePath = segment.audio_storage_path as string | null;
    if (!storagePath) {
      notReady.push({ segment_key: segmentKey, status: "ready but missing storage_path" });
    }
  }

  if (missing.length > 0 || notReady.length > 0) {
    const error: EpisodeAudioReadinessError = {
      type: missing.length > 0 ? "missing_segments" : "not_ready",
      details: {
        missing: missing.length > 0 ? missing : undefined,
        notReady: notReady.length > 0 ? notReady : undefined,
      },
    };
    throw new EpisodeAudioNotReadyError(error);
  }

  // Check episode MP3 exists in storage
  const episodePath = buildEpisodeAudioStoragePath({ episodeDate, programSlug });

  // Try to create a signed URL (will fail if file doesn't exist)
  // This is a reliable way to check file existence
  const { data: urlData, error: urlError } = await supabase.storage
    .from("audio-private")
    .createSignedUrl(episodePath, 60); // 60s expiry, just for existence check

  if (urlError || !urlData) {
    const error: EpisodeAudioReadinessError = {
      type: "missing_episode_mp3",
      details: {
        episodePath,
      },
    };
    throw new EpisodeAudioNotReadyError(error);
  }

  // All checks passed
}

/**
 * Typed error for episode audio readiness failures.
 */
export class EpisodeAudioNotReadyError extends Error {
  constructor(public readonly readinessError: EpisodeAudioReadinessError) {
    const { type, details } = readinessError;
    let message = `Episode audio not ready (${type})`;

    if (details.missing && details.missing.length > 0) {
      message += `: Missing segments: ${details.missing.join(", ")}`;
    }
    if (details.notReady && details.notReady.length > 0) {
      const statusList = details.notReady
        .map((s) => `${s.segment_key} (${s.status})`)
        .join(", ");
      message += `: Not ready: ${statusList}`;
    }
    if (details.episodePath) {
      message += `: Episode MP3 missing at ${details.episodePath}`;
    }

    super(message);
    this.name = "EpisodeAudioNotReadyError";
  }
}
