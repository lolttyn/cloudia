# Audio Pipeline Operations Contract

**Status**: Segment audio generation is production-ready. Episode assembly and publishing are in progress.

---

## 1. Unit of Work

- **One segment = one audio job**
  - Segment keys: `intro`, `main_themes`, `closing`
- **One approved segment produces exactly one "current" segment audio artifact**
  - Generated from: `cloudia_segments.script_text`
  - Config from: `cloudia_segments.tts_voice_id`, `cloudia_segments.tts_model_id`

---

## 2. Source of Truth

**Table**: `cloudia_segments`

**Fields used by audio pipeline**:
- `audio_status` (required) - lifecycle state
- `script_text` (required) - approved script text for TTS
- `script_version` (used for path/versioning)
- `tts_voice_id`, `tts_model_id` (required) - TTS configuration
- `audio_storage_path` (written on success) - storage location
- `audio_duration_seconds` (written on success) - duration metadata
- Error details stored via RPC payloads

**Note**: `cloudia_segments` only contains approved segments (`gate_decision = 'approve'`). This is the authoritative source for both script approval and audio generation.

---

## 3. Lifecycle States

```
pending → generating → ready | failed
```

**Operational meaning**:
- **`pending`**: Eligible for claim by audio worker
- **`generating`**: Claimed by worker; generation in progress
- **`ready`**: Storage upload succeeded; `audio_storage_path` & `audio_duration_seconds` persisted
- **`failed`**: Generation attempt failed; error recorded; may be retried by requeue RPC

---

## 4. Claiming & Locking

**Atomic claim**: RPC `audio_claim_pending_segment`
- Updates `audio_status = 'generating'` atomically
- Returns claimed segment row
- If zero rows returned → another worker claimed it

**Stale recovery**: RPC `audio_requeue_stale_generating`
- Requeues segments stuck in `generating` state > TTL minutes
- Called automatically by worker loop

**Retry policy**: RPC `audio_requeue_failed`
- Re-enqueues failed segments based on error classification
- Max 3 attempts total
- Retryable errors: `tts_rate_limited`, `tts_timeout`, `tts_network`

---

## 5. Storage Contract

**Provider**: Supabase Storage  
**Bucket**: `audio-private`

**Segment path pattern** (versioned, deterministic):
```
cloudia/segments/{episodeDate}/{segmentKey}/v{scriptVersion}/{jobKey}.mp3
```

Where `jobKey` = `{episodeId}::{segmentKey}::{scriptVersion}::{ttsVoiceId}::{ttsModelId}`

**Episode path pattern** (stitched artifact):
```
cloudia/episodes/{episodeDate}/episode.mp3
```

**Upload behavior**: Idempotent (`upsert: true`)

---

## 6. Quality Gates

Before marking `ready`, worker validates:
- File exists, non-zero bytes
- Duration within segment-specific bounds (via `qaDuration`)
- Script word count sanity (via `qaScriptWordCount`)
- Leading/trailing silence detection

Failures → `audio_status = 'failed'` with error class + message

---

## 7. TTS Integration

**Provider**: ElevenLabs  
**Endpoint**: `https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`  
**Format**: MP3  
**Config**: Environment variables
- `ELEVENLABS_API_KEY` (required)
- `CLOUDIA_TTS_VOICE_ID` (set per segment via `markSegmentReadyForAudio`)
- `CLOUDIA_TTS_MODEL_ID` (set per segment via `markSegmentReadyForAudio`)

---

## 8. Episode Assembly (H3)

**Prerequisites**:
- All required segments (`intro`, `main_themes`, `closing`) have `audio_status = 'ready'`
- All segments have valid `audio_storage_path`

**Process**:
1. Load ready segments for episode date (ordered: intro → main_themes → closing)
2. Download segment MP3s from storage
3. Concatenate using ffmpeg concat demuxer
4. Upload stitched episode to `cloudia/episodes/{episodeDate}/episode.mp3`

**Readiness gate**: `assertEpisodeAudioReady()` validates:
- All required segments exist and are `ready`
- Episode MP3 exists at expected path

---

## 9. What This Contract Does NOT Define Yet

- Publishing destinations & external IDs (H4 - in progress)
- Structured logs + alerts (H5 - in progress)
- Episode-level metadata persistence (optional schema addition)

---

## 10. Worker Execution

**Entrypoint**: `crew_cloudia/audio/worker/runAudioWorkerLoop.ts`

**Behavior**:
- Polls every 5s (configurable via `CLOUDIA_AUDIO_POLL_MS`)
- Processes one segment per tick (`limit: 1`)
- Kill switch: `CLOUDIA_AUDIO_WORKER_DISABLED=1`

**Single-run mode**: `runAudioWorkerOnce.ts` (for testing/debugging)

---

## 11. Marking Segments Ready for Audio

**Function**: `markSegmentReadyForAudio({ episode_id, segment_key })`

**Called from**:
- `run-intro.ts` (after intro approval)
- `run-main-themes.ts` (after main_themes approval)
- `run-closing.ts` (after closing approval)

**Effect**: Sets `audio_status = 'pending'` and populates TTS config

---

## Notes

- **Segment audio is production-ready**: The worker loop, claiming, TTS, storage, and QA are all operational.
- **Missing pieces**: Episode assembly (H3), publishing adapters (H4), and structured observability (H5) are in progress.
- **No migration needed**: Current storage paths are versioned and deterministic. Episode paths are additive.
