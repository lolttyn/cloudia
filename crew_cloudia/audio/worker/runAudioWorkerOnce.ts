import "dotenv/config";
import { supabase } from "../../lib/supabaseClient";
import { buildAudioJobKey, buildSegmentAudioStoragePath } from "./buildAudioStoragePath";
import { rpcClaimPendingSegment, rpcMarkFailed, rpcMarkReady } from "./supabaseAudioRpcs";
import { uploadToAudioPrivateBucket } from "./storageUpload";
import { synthesizeElevenLabsMp3 } from "./elevenlabsTts";
import { qaNonEmpty, qaDuration, qaScriptWordCount } from "./audioQa";
import { classifyError, decideRetry, sleep } from "./retryPolicy";
import { getMp3DurationSecondsFromBytes } from "./ffprobeDuration";
import { detectLeadingTrailingSilenceFromMp3Bytes } from "./silenceDetect";

function requireEnv(name: string) {
  if (!process.env[name]) throw new Error(`Missing env var: ${name}`);
}

export async function runAudioWorkerOnce(params?: {
  limit?: number;
  episodeDate?: string | null;
  segmentKey?: string | null;
}) {
  // Worker requires a key that can write storage + call RPCs
  // If your supabaseClient currently uses the anon key, this will fail.
  // We'll fix supabaseClient to prefer service role for workers in the next task if needed.
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Requeue stale generating jobs (best-effort)
  // TTL is configurable via CLOUDIA_AUDIO_GENERATING_TTL_MINUTES (default: 15 minutes)
  try {
    const ttlMinutesRaw = process.env.CLOUDIA_AUDIO_GENERATING_TTL_MINUTES ?? "15";
    const ttlMinutes = Number(ttlMinutesRaw);
    const ttlMinutesValid = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 15;
    
    const { data, error } = await supabase.rpc("audio_requeue_stale_generating", { 
      p_ttl_minutes: ttlMinutesValid 
    });
    if (error) {
      console.warn("[audio-worker] stale requeue RPC error", { 
        error: error.message, 
        ttlMinutes: ttlMinutesValid 
      });
    } else {
      const count = typeof data === "number" ? data : 0;
      console.log("[audio-worker] requeued stale generating", { 
        count, 
        ttlMinutes: ttlMinutesValid 
      });
    }
  } catch (e: any) {
    console.warn("[audio-worker] stale requeue failed (ignored)", { msg: e?.message ?? String(e) });
  }

  const limit = params?.limit ?? 1;

  let q = supabase
    .from("cloudia_segments")
    .select("episode_id, segment_key, episode_date, script_version, script_text, tts_voice_id, tts_model_id, audio_status")
    .eq("audio_status", "pending")
    .order("episode_date", { ascending: true });

  if (params?.episodeDate) q = q.eq("episode_date", params.episodeDate);
  if (params?.segmentKey) q = q.eq("segment_key", params.segmentKey);

  const { data: rows, error } = await q.limit(limit);

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

    let claimed: any = null;
    let attempt = 1;

    try {
      claimed = await rpcClaimPendingSegment({ episodeId, segmentKey, jobKey });
      attempt = Number(claimed?.audio_attempt_count ?? 1);

      const scriptText = row.script_text as string;
      
      // Check script word count before TTS (deterministic, cheap)
      const qaScript = qaScriptWordCount({ segmentKey, scriptText });
      if (!qaScript.ok) {
        throw new Error(`${qaScript.errorClass}: ${qaScript.message}`);
      }

      const storagePath = buildSegmentAudioStoragePath({
        episodeDate: row.episode_date as string,
        segmentKey,
        scriptVersion: row.script_version as number,
        jobKey,
        ext: "mp3",
      });

      const tts = await synthesizeElevenLabsMp3({
        text: scriptText,
        voiceId: ttsVoiceId,
        modelId: ttsModelId,
      });

      const qa = qaNonEmpty(tts.bytes);
      if (!qa.ok) {
        throw new Error(`${qa.errorClass}: ${qa.message}`);
      }

      const durationSeconds = await getMp3DurationSecondsFromBytes(tts.bytes);

      const qa2 = qaDuration({ segmentKey, durationSeconds });
      if (!qa2.ok) {
        throw new Error(`${qa2.errorClass}: ${qa2.message}`);
      }

      const silence = await detectLeadingTrailingSilenceFromMp3Bytes(tts.bytes);
      if (silence.leadingSilenceSeconds > 1.0) {
        throw new Error(`qa_silence_leading: leading silence ${silence.leadingSilenceSeconds}s > 1.0s`);
      }

      await uploadToAudioPrivateBucket({ path: storagePath, bytes: tts.bytes, contentType: "audio/mpeg" });

      await rpcMarkReady({
        episodeId,
        segmentKey,
        jobKey,
        audioStoragePath: storagePath,
        durationSeconds,
        codec: "mp3",
        sampleRateHz: null,
        checksumSha256: null,
      });

      console.log("[audio-worker] ready", { episodeId, segmentKey, storagePath });
    } catch (e: any) {
      const { errorClass, message } = classifyError(e);
      console.error("[audio-worker] failed", { episodeId, segmentKey, jobKey, errorClass, msg: message });

      // Try mark failed (best-effort)
      try {
        await rpcMarkFailed({
          episodeId,
          segmentKey,
          jobKey,
          errorClass,
          errorMessage: message,
        });
      } catch (markErr: any) {
        console.error("[audio-worker] mark_failed failed", { episodeId, segmentKey, err: markErr?.message ?? String(markErr) });
      }

      // Decide retry using current attempt count (if claim succeeded)
      // We can fetch attempt from DB if needed, but simplest: assume attemptCount>=1 once claimed.
      // If claim never happened, requeue doesn't matter.
      if (claimed) {
        const decision = decideRetry({ attempt, errorClass });
        if (decision.shouldRetry) {
          try {
            await supabase.rpc("audio_requeue_failed", {
              p_episode_id: episodeId,
              p_segment_key: segmentKey,
              p_reason: `retrying after ${errorClass}`,
            });
            console.log("[audio-worker] requeued for retry", { episodeId, segmentKey, attempt, backoffMs: decision.backoffMs });
            await sleep(decision.backoffMs);
          } catch (requeueErr: any) {
            console.error("[audio-worker] requeue_failed failed", { episodeId, segmentKey, err: requeueErr?.message ?? String(requeueErr) });
          }
        }
      }
    }
  }
}

function parseArgInt(name: string, defaultValue: number) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return defaultValue;
  const raw = process.argv[idx + 1];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.floor(n);
}

function parseArgString(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
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
    const limit = parseArgInt("limit", 1);
    const episodeDate = parseArgString("episode-date"); // YYYY-MM-DD
    const segmentKey = parseArgString("segment-key");
    runAudioWorkerOnce({ limit, episodeDate, segmentKey }).catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}

