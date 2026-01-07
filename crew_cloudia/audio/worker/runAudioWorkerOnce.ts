import "dotenv/config";
import { supabase } from "../../lib/supabaseClient";
import { buildAudioJobKey, buildSegmentAudioStoragePath } from "./buildAudioStoragePath";
import { rpcClaimPendingSegment, rpcMarkFailed, rpcMarkReady } from "./supabaseAudioRpcs";
import { uploadToAudioPrivateBucket } from "./storageUpload";
import { generatePlaceholderAudioMp3Bytes } from "./generatePlaceholderAudio";

function requireEnv(name: string) {
  if (!process.env[name]) throw new Error(`Missing env var: ${name}`);
}

export async function runAudioWorkerOnce(params?: { limit?: number }) {
  // Worker requires a key that can write storage + call RPCs
  // If your supabaseClient currently uses the anon key, this will fail.
  // We'll fix supabaseClient to prefer service role for workers in the next task if needed.
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const limit = params?.limit ?? 5;

  const { data: rows, error } = await supabase
    .from("cloudia_segments")
    .select("episode_id, segment_key, episode_date, script_version, script_text, tts_voice_id, tts_model_id, audio_status")
    .eq("audio_status", "pending")
    .order("episode_date", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log("[audio-worker] no pending segments");
    return;
  }

  for (const row of rows) {
    const episodeId = row.episode_id as string;
    const segmentKey = row.segment_key as string;

    const ttsVoiceId = row.tts_voice_id as string | null;
    const ttsModelId = row.tts_model_id as string | null;

    // Claim RPC enforces these, but fail fast for clarity
    if (!ttsVoiceId || !ttsModelId) {
      console.log("[audio-worker] missing tts config", { episodeId, segmentKey });
      continue;
    }

    const jobKey = buildAudioJobKey({
      episodeId,
      segmentKey,
      scriptVersion: row.script_version as number,
      ttsVoiceId,
      ttsModelId,
    });

    try {
      await rpcClaimPendingSegment({ episodeId, segmentKey, jobKey });

      const storagePath = buildSegmentAudioStoragePath({
        episodeDate: row.episode_date as string,
        segmentKey,
        scriptVersion: row.script_version as number,
        jobKey,
        ext: "mp3",
      });

      const bytes = generatePlaceholderAudioMp3Bytes();
      await uploadToAudioPrivateBucket({ path: storagePath, bytes, contentType: "audio/mpeg" });

      // Placeholder duration; real duration comes from actual audio in next step
      await rpcMarkReady({
        episodeId,
        segmentKey,
        jobKey,
        audioStoragePath: storagePath,
        durationSeconds: 0.0,
        codec: "placeholder",
        sampleRateHz: null,
        checksumSha256: null,
      });

      console.log("[audio-worker] ready", { episodeId, segmentKey, storagePath });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error("[audio-worker] failed", { episodeId, segmentKey, jobKey, msg });

      // Try to mark failed if we already claimed (best effort)
      try {
        await rpcMarkFailed({
          episodeId,
          segmentKey,
          jobKey,
          errorClass: "worker_error",
          errorMessage: msg,
        });
      } catch (markErr: any) {
        console.error("[audio-worker] mark_failed failed", { episodeId, segmentKey, err: markErr?.message ?? String(markErr) });
      }
    }
  }
}

// Allow running as a script: npx tsx crew_cloudia/audio/worker/runAudioWorkerOnce.ts
if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    runAudioWorkerOnce({ limit: 5 }).catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}

