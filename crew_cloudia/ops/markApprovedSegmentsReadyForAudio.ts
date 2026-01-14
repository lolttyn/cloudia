import "dotenv/config";

import { supabase } from "../lib/supabaseClient.js";
import { markSegmentReadyForAudio } from "../audio/markSegmentReadyForAudio.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Mark approved segments as ready for audio generation.
 * 
 * Finds segments in cloudia_segments where:
 * - gate_decision = 'approve'
 * - segment_key IN ('intro','main_themes','closing')
 * - audio_status IS NULL OR audio_status IN ('ready', 'failed')
 * 
 * Then calls markSegmentReadyForAudio for each eligible segment.
 * 
 * Usage:
 *   tsx crew_cloudia/ops/markApprovedSegmentsReadyForAudio.ts [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--dry-run]
 */
async function main() {
  const args = process.argv.slice(2);
  let startDate: string | null = null;
  let endDate: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--start-date") {
      startDate = args[i + 1];
      if (!startDate) {
        throw new Error("--start-date requires a value (YYYY-MM-DD)");
      }
      i++;
    } else if (arg === "--end-date") {
      endDate = args[i + 1];
      if (!endDate) {
        throw new Error("--end-date requires a value (YYYY-MM-DD)");
      }
      i++;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  // Require TTS env vars (same as markSegmentReadyForAudio)
  requireEnv("CLOUDIA_TTS_VOICE_ID");
  requireEnv("CLOUDIA_TTS_MODEL_ID");
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Build query
  let query = supabase
    .from("cloudia_segments")
    .select("episode_id, episode_date, segment_key, script_text, audio_status, gate_decision")
    .eq("gate_decision", "approve")
    .in("segment_key", ["intro", "main_themes", "closing"]);

  // Filter by date range if provided
  if (startDate) {
    query = query.gte("episode_date", startDate);
  }
  if (endDate) {
    query = query.lte("episode_date", endDate);
  }

  // Filter by audio_status: NULL or states that indicate it should be re-marked
  // We want to mark segments that haven't been marked pending yet, or that are in
  // terminal states that should be retried
  query = query.or("audio_status.is.null,audio_status.eq.failed");

  const { data: segments, error } = await query;

  if (error) {
    throw new Error(`Failed to query segments: ${error.message}`);
  }

  if (!segments || segments.length === 0) {
    console.log("No eligible segments found to mark for audio.");
    return;
  }

  console.log(`Found ${segments.length} eligible segment(s) to mark for audio.`);

  if (dryRun) {
    console.log("\n[DRY RUN] Would mark the following segments:");
    for (const seg of segments) {
      console.log(
        `  ${seg.episode_date} / ${seg.segment_key} (episode_id: ${seg.episode_id}, current audio_status: ${seg.audio_status ?? "NULL"})`
      );
    }
    return;
  }

  // Mark each segment
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ episode_date: string; segment_key: string; error: string }> = [];

  for (const seg of segments) {
    try {
      await markSegmentReadyForAudio({
        episode_id: seg.episode_id as string,
        segment_key: seg.segment_key as string,
      });
      console.log(`✓ Marked ${seg.episode_date} / ${seg.segment_key}`);
      succeeded++;
    } catch (err: any) {
      const errorMsg = err?.message ?? String(err);
      console.error(`✗ Failed to mark ${seg.episode_date} / ${seg.segment_key}: ${errorMsg}`);
      failed++;
      errors.push({
        episode_date: seg.episode_date as string,
        segment_key: seg.segment_key as string,
        error: errorMsg,
      });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errors) {
      console.log(`  ${e.episode_date} / ${e.segment_key}: ${e.error}`);
    }
    process.exit(1);
  }
}

if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
