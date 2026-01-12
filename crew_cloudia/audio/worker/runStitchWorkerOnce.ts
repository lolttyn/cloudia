import "dotenv/config";
import { supabase } from "../../lib/supabaseClient.js";
import { loadReadySegmentAudioForDate } from "../episode/loadReadySegmentAudioForDate.js";
import { runStitchEpisode } from "../runStitchEpisode.js";
import { audioLogHelpers } from "./audioLog.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Stitch worker: checks for episodes with all segments ready and stitches them.
 * 
 * This is a "best effort" worker that:
 * - Queries for episode dates with all segments ready
 * - Attempts to stitch if episode MP3 doesn't exist yet
 * - No-ops if already stitched or segments not ready
 * 
 * Designed to run periodically (e.g., every 5 minutes) to catch episodes
 * that become ready after the audio worker finishes segments.
 */
export async function runStitchWorkerOnce(params?: {
  limit?: number; // Max episodes to stitch per run (default: 1)
  programSlug?: string; // Filter to specific program (optional)
}): Promise<void> {
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const limit = params?.limit ?? 1;
  const programSlug = params?.programSlug ?? "cloudia";

  // Query for episode dates that have all required segments ready
  // but don't have an episode MP3 yet (we'll check storage existence)
  const { data: segments, error } = await supabase
    .from("cloudia_segments")
    .select("episode_date, segment_key, audio_status, audio_storage_path")
    .in("segment_key", ["intro", "main_themes", "closing"])
    .eq("audio_status", "ready")
    .not("audio_storage_path", "is", null)
    .order("episode_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to query ready segments: ${error.message}`);
  }

  if (!segments || segments.length === 0) {
    console.log("[stitch-worker] no ready segments found");
    return;
  }

  // Group by episode_date
  const episodesByDate = new Map<string, typeof segments>();
  for (const segment of segments) {
    const date = segment.episode_date as string;
    if (!episodesByDate.has(date)) {
      episodesByDate.set(date, []);
    }
    episodesByDate.get(date)!.push(segment);
  }

  // Find dates with all 3 segments ready
  const readyDates: string[] = [];
  for (const [date, segs] of episodesByDate.entries()) {
    const segmentKeys = new Set(segs.map((s) => s.segment_key as string));
    if (segmentKeys.has("intro") && segmentKeys.has("main_themes") && segmentKeys.has("closing")) {
      readyDates.push(date);
    }
  }

  if (readyDates.length === 0) {
    console.log("[stitch-worker] no episodes with all segments ready");
    return;
  }

  // Check which ones don't have episode MP3 yet
  const datesToStitch: string[] = [];
  for (const date of readyDates.slice(0, limit)) {
    // Check if episode MP3 exists
    const episodePath = `cloudia/episodes/${date}/episode.mp3`;
    const { data: urlData, error: urlError } = await supabase.storage
      .from("audio-private")
      .createSignedUrl(episodePath, 60);

    if (urlError || !urlData) {
      // Episode MP3 doesn't exist, needs stitching
      datesToStitch.push(date);
    } else {
      console.log(`[stitch-worker] episode ${date} already stitched, skipping`);
    }
  }

  if (datesToStitch.length === 0) {
    console.log("[stitch-worker] all ready episodes already stitched");
    return;
  }

  // Stitch each episode
  for (const episodeDate of datesToStitch) {
    try {
      console.log(`[stitch-worker] stitching episode ${episodeDate}...`);
      await runStitchEpisode({
        programSlug,
        episodeDate,
      });
      console.log(`[stitch-worker] successfully stitched ${episodeDate}`);
    } catch (err: any) {
      const errorMessage = err?.message ?? String(err);
      console.error(`[stitch-worker] failed to stitch ${episodeDate}:`, errorMessage);
      // Continue to next episode (don't fail entire run)
    }
  }
}

// Allow running as a script
if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    const limit = process.argv.includes("--limit")
      ? Number(process.argv[process.argv.indexOf("--limit") + 1]) || 1
      : 1;
    const programSlug = process.argv.includes("--program")
      ? process.argv[process.argv.indexOf("--program") + 1] || "cloudia"
      : "cloudia";

    runStitchWorkerOnce({ limit, programSlug }).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
