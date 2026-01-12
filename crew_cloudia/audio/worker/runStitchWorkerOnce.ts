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
 * 
 * Configuration:
 * - CLOUDIA_STITCH_WORKER_SCAN_LIMIT: Max dates to scan per run (default: 30)
 *   Increase this if you have a large backlog of ready episodes.
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

  // Scan up to scanLimit dates to find stitchable ones (don't limit to `limit` for discovery)
  // This prevents premature "all stitched" conclusion when first N dates are already done
  // Configurable via CLOUDIA_STITCH_WORKER_SCAN_LIMIT (default: 30)
  const scanLimit = Number(process.env.CLOUDIA_STITCH_WORKER_SCAN_LIMIT ?? "30");
  const datesToCheck = readyDates.slice(0, scanLimit);

  let stitchedCount = 0;
  let skippedCount = 0;

  // Iterate through dates until we've stitched `limit` episodes or exhausted the list
  for (const date of datesToCheck) {
    // Stop if we've reached the stitch limit
    if (stitchedCount >= limit) {
      break;
    }

    // Check if episode MP3 exists
    const episodePath = `cloudia/episodes/${date}/episode.mp3`;
    const { data: urlData, error: urlError } = await supabase.storage
      .from("audio-private")
      .createSignedUrl(episodePath, 60);

    if (urlError || !urlData) {
      // Episode MP3 doesn't exist, needs stitching
      try {
        console.log(`[stitch-worker] stitching episode ${date}...`);
        await runStitchEpisode({
          programSlug,
          episodeDate: date,
        });
        console.log(`[stitch-worker] successfully stitched ${date}`);
        stitchedCount++;
      } catch (err: any) {
        const errorMessage = err?.message ?? String(err);
        console.error(`[stitch-worker] failed to stitch ${date}:`, errorMessage);
        // Continue to next episode (don't fail entire run)
      }
    } else {
      // Already stitched, skip and continue scanning
      skippedCount++;
      // Don't log every skip to avoid noise (only log if we're about to conclude)
    }
  }

  // Log summary
  if (stitchedCount > 0) {
    console.log(`[stitch-worker] stitched ${stitchedCount} episode(s), skipped ${skippedCount} already-stitched`);
  } else if (skippedCount === datesToCheck.length) {
    // All checked dates were already stitched
    console.log(`[stitch-worker] checked ${skippedCount} episode(s), all already stitched`);
  } else if (readyDates.length > scanLimit) {
    // There are more dates beyond what we scanned
    console.log(`[stitch-worker] checked ${datesToCheck.length} of ${readyDates.length} ready episodes, none needed stitching`);
  } else {
    // Exhausted all ready dates
    console.log(`[stitch-worker] checked all ${readyDates.length} ready episode(s), none needed stitching`);
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
