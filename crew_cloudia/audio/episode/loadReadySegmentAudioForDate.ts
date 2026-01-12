import { supabase } from "../../lib/supabaseClient";

export type ReadySegmentAudio = {
  segment_key: string;
  audio_storage_path: string;
  audio_duration_seconds: number;
};

/**
 * Load ready segment audio for an episode date.
 * 
 * Returns segments in required order: intro → main_themes → closing
 * 
 * Throws if any required segment is missing or not ready.
 */
export async function loadReadySegmentAudioForDate(params: {
  episodeDate: string; // YYYY-MM-DD
  requiredSegments?: string[]; // Defaults to ["intro", "main_themes", "closing"]
}): Promise<ReadySegmentAudio[]> {
  const { episodeDate, requiredSegments = ["intro", "main_themes", "closing"] } = params;

  // Query all segments for this date
  const { data, error } = await supabase
    .from("cloudia_segments")
    .select("segment_key, audio_status, audio_storage_path, audio_duration_seconds")
    .eq("episode_date", episodeDate)
    .in("segment_key", requiredSegments);

  if (error) {
    throw new Error(`Failed to query segments for ${episodeDate}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`No segments found for episode date ${episodeDate}`);
  }

  // Build map for lookup
  const segmentMap = new Map<string, typeof data[0]>();
  for (const row of data) {
    segmentMap.set(row.segment_key as string, row);
  }

  // Validate and collect in order
  const ready: ReadySegmentAudio[] = [];
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
      continue;
    }

    const duration = segment.audio_duration_seconds as number | null;
    if (duration == null || duration <= 0) {
      notReady.push({ segment_key: segmentKey, status: "ready but invalid duration" });
      continue;
    }

    ready.push({
      segment_key: segmentKey,
      audio_storage_path: storagePath,
      audio_duration_seconds: duration,
    });
  }

  // Build error message if any issues
  if (missing.length > 0 || notReady.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Missing segments: ${missing.join(", ")}`);
    }
    if (notReady.length > 0) {
      const statusList = notReady.map((s) => `${s.segment_key} (${s.status})`).join(", ");
      parts.push(`Not ready: ${statusList}`);
    }
    throw new Error(`Cannot stitch episode ${episodeDate}: ${parts.join("; ")}`);
  }

  return ready;
}
