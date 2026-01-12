import "dotenv/config";
import { supabase } from "../lib/supabaseClient.js";

/**
 * Quick script to check if segments are ready for a given date.
 * Usage: npx tsx crew_cloudia/audio/test-check-readiness.ts 2026-01-20
 */

const episodeDate = process.argv[2];

if (!episodeDate) {
  console.error("Usage: npx tsx crew_cloudia/audio/test-check-readiness.ts <episode_date>");
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase
    .from("cloudia_segments")
    .select("segment_key, audio_status, audio_storage_path, audio_duration_seconds")
    .eq("episode_date", episodeDate)
    .in("segment_key", ["intro", "main_themes", "closing"]);

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(`No segments found for ${episodeDate}`);
    process.exit(1);
  }

  console.log(`\nSegment readiness for ${episodeDate}:`);
  console.log("=" .repeat(50));

  const required = ["intro", "main_themes", "closing"];
  let allReady = true;

  for (const segmentKey of required) {
    const segment = data.find((s) => s.segment_key === segmentKey);
    if (!segment) {
      console.log(`❌ ${segmentKey}: MISSING`);
      allReady = false;
      continue;
    }

    const status = segment.audio_status as string | null;
    const path = segment.audio_storage_path as string | null;
    const duration = segment.audio_duration_seconds as number | null;

    if (status === "ready" && path && duration) {
      console.log(`✅ ${segmentKey}: READY (${duration.toFixed(1)}s) - ${path}`);
    } else {
      console.log(`❌ ${segmentKey}: ${status || "null"} (path: ${path ? "✓" : "✗"}, duration: ${duration ?? "null"})`);
      allReady = false;
    }
  }

  console.log("=" .repeat(50));
  if (allReady) {
    console.log(`\n✅ All segments ready! You can run:`);
    console.log(`   npx tsx crew_cloudia/audio/runStitchEpisode.ts cloudia ${episodeDate}`);
  } else {
    console.log(`\n❌ Not all segments ready. Run audio worker or check status.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
