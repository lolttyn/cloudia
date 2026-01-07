import "dotenv/config";
import { markSegmentReadyForAudio } from "./markSegmentReadyForAudio.js";

const episodeId = process.argv[2];
const segmentKey = process.argv[3];

if (!episodeId || !segmentKey) {
  console.error("Usage: tsx test-mark-pending.ts <episode_id> <segment_key>");
  process.exit(1);
}

await markSegmentReadyForAudio({
  episode_id: episodeId,
  segment_key: segmentKey,
});

console.log(`Marked ${episodeId}/${segmentKey} as pending with TTS config`);

