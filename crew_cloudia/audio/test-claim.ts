import "dotenv/config";
import { buildAudioJobKey } from "./worker/buildAudioStoragePath.js";
import { rpcClaimPendingSegment } from "./worker/supabaseAudioRpcs.js";

const episodeId = "ea5aa404-13ee-f7ca-7a9a-c217d446dacd";
const segmentKey = "intro";

const jobKey = buildAudioJobKey({
  episodeId,
  segmentKey,
  scriptVersion: 1,
  ttsVoiceId: "default",
  ttsModelId: "default",
});

console.log("Calling claim RPC with jobKey:", jobKey);

try {
  const result = await rpcClaimPendingSegment({
    episodeId,
    segmentKey,
    jobKey,
  });
  console.log("Claim successful:", result);
} catch (e: any) {
  console.error("Claim failed:", e.message);
  console.error("Full error:", e);
}

