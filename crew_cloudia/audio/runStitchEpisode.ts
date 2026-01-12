import "dotenv/config";
import { loadReadySegmentAudioForDate } from "./episode/loadReadySegmentAudioForDate.js";
import { downloadAudioBuffers } from "./episode/downloadAudioBuffers.js";
import { stitchMp3 } from "./episode/stitchMp3.js";
import { buildEpisodeAudioStoragePath } from "./episode/buildEpisodeAudioStoragePath.js";
import { uploadEpisodeMp3 } from "./episode/uploadEpisodeMp3.js";
import { audioLogHelpers } from "./worker/audioLog.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseArgs(): { programSlug: string; episodeDate: string } {
  const [, , programSlug, episodeDate] = process.argv;

  if (!programSlug || !episodeDate) {
    throw new Error(
      "Usage: tsx crew_cloudia/audio/runStitchEpisode.ts <program_slug> <episode_date YYYY-MM-DD>"
    );
  }

  // Validate date format (basic)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(episodeDate)) {
    throw new Error(`Invalid episode_date format: ${episodeDate} (expected YYYY-MM-DD)`);
  }

  return { programSlug, episodeDate };
}

/**
 * Stitch episode audio from ready segments.
 * 
 * This is the main entrypoint for episode stitching.
 * It can be called directly or via the stitch worker.
 */
export async function runStitchEpisode(params: {
  programSlug: string;
  episodeDate: string;
}): Promise<{
  storagePath: string;
  durationSeconds: number;
}> {
  const { programSlug, episodeDate } = params;

  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`[stitch] Starting episode stitch for ${episodeDate}`);
  audioLogHelpers.stitchStarted({ episode_date: episodeDate });

  try {
    // 1. Load ready segments
  console.log(`[stitch] Loading ready segments...`);
  const readySegments = await loadReadySegmentAudioForDate({
    episodeDate,
    requiredSegments: ["intro", "main_themes", "closing"],
  });

  console.log(`[stitch] Found ${readySegments.length} ready segments`);

  // 2. Download segment audio files
  console.log(`[stitch] Downloading segment audio...`);
  const segmentBuffers = await downloadAudioBuffers({
    storagePaths: readySegments.map((s) => s.audio_storage_path),
  });

  console.log(`[stitch] Downloaded ${segmentBuffers.length} segments`);

  // 3. Stitch segments
  console.log(`[stitch] Stitching segments with ffmpeg...`);
  const stitched = await stitchMp3({ segments: segmentBuffers });

  console.log(`[stitch] Stitched episode duration: ${stitched.durationSeconds.toFixed(2)}s`);

  // 4. Build storage path
  const storagePath = buildEpisodeAudioStoragePath({ episodeDate, programSlug });

  // 5. Upload stitched episode
  console.log(`[stitch] Uploading to ${storagePath}...`);
  await uploadEpisodeMp3({
    storagePath,
    bytes: stitched.bytes,
  });

  console.log(`[stitch] Complete: ${storagePath} (${stitched.durationSeconds.toFixed(2)}s)`);

    audioLogHelpers.stitchSucceeded({
      episode_date: episodeDate,
      duration_seconds: stitched.durationSeconds,
      storage_path: storagePath,
    });

    return {
      storagePath,
      durationSeconds: stitched.durationSeconds,
    };
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    const errorCode = err?.name ?? "stitch_error";
    
    audioLogHelpers.stitchFailed({
      episode_date: episodeDate,
      error_code: errorCode,
      error_message: errorMessage,
    });
    
    throw err;
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
    const { programSlug, episodeDate } = parseArgs();
    runStitchEpisode({ programSlug, episodeDate })
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
}
