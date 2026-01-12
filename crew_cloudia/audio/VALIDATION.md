# H3 Episode Stitching - Validation Guide

## Prerequisites

Before testing episode stitching, ensure:

1. **Segments are ready**: All three segments (`intro`, `main_themes`, `closing`) for the target date have:
   - `audio_status = 'ready'`
   - `audio_storage_path` is set (not null)
   - Segment MP3 files exist in `audio-private` bucket

2. **Environment variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ELEVENLABS_API_KEY` (not needed for stitching, but should be set)

## Step 1: Check Segment Readiness

```bash
npx tsx crew_cloudia/audio/test-check-readiness.ts 2026-01-20
```

**Expected output**:
```
Segment readiness for 2026-01-20:
==================================================
✅ intro: READY (45.2s) - cloudia/segments/2026-01-20/intro/v1/...
✅ main_themes: READY (180.5s) - cloudia/segments/2026-01-20/main_themes/v1/...
✅ closing: READY (32.1s) - cloudia/segments/2026-01-20/closing/v1/...
==================================================
✅ All segments ready! You can run:
   npx tsx crew_cloudia/audio/runStitchEpisode.ts cloudia 2026-01-20
```

If any segment shows `❌`, run the audio worker first:
```bash
npm run audio-worker
# Or single-run: npx tsx crew_cloudia/audio/worker/runAudioWorkerOnce.ts
```

## Step 2: Run Episode Stitching

```bash
npx tsx crew_cloudia/audio/runStitchEpisode.ts cloudia 2026-01-20
```

**Expected output**:
```
[stitch] Starting episode stitch for 2026-01-20
{"timestamp":"2026-01-20T...","event":"episode.stitch.started","episode_date":"2026-01-20"}
[stitch] Loading ready segments...
[stitch] Found 3 ready segments
[stitch] Downloading segment audio...
[stitch] Downloaded 3 segments
[stitch] Stitching segments with ffmpeg...
[stitch] Stitched episode duration: 257.80s
[stitch] Uploading to cloudia/episodes/2026-01-20/episode.mp3...
[stitch] Complete: cloudia/episodes/2026-01-20/episode.mp3 (257.80s)
{"timestamp":"2026-01-20T...","event":"episode.stitch.succeeded","episode_date":"2026-01-20","duration_seconds":257.80,"storage_path":"cloudia/episodes/2026-01-20/episode.mp3"}
{
  "storagePath": "cloudia/episodes/2026-01-20/episode.mp3",
  "durationSeconds": 257.80
}
```

## Step 3: Validate Stitched Audio

### Check Storage Existence

The stitched episode should exist at:
```
cloudia/episodes/2026-01-20/episode.mp3
```

### Download and Listen

1. **Get signed URL** (via Supabase dashboard or API):
   ```typescript
   const { data } = await supabase.storage
     .from("audio-private")
     .createSignedUrl("cloudia/episodes/2026-01-20/episode.mp3", 3600);
   ```

2. **Listen for**:
   - Smooth transitions between segments (no gaps, no clicks)
   - Correct order: intro → main_themes → closing
   - No audio corruption or header issues
   - Total duration matches sum of segments (approximately)

### Verify Duration

The stitched duration should be approximately the sum of segment durations:
- `intro` + `main_themes` + `closing` ≈ `episode.mp3` duration
- Small variance (< 1s) is normal due to MP3 frame boundaries

## Step 4: Test Readiness Gate

```bash
npx tsx -e "
import { assertEpisodeAudioReady } from './crew_cloudia/audio/episode/assertEpisodeAudioReady.js';
await assertEpisodeAudioReady({ episodeDate: '2026-01-20', programSlug: 'cloudia' });
console.log('✅ Episode is ready for publishing');
"
```

**Expected**: No error thrown (episode passes all checks)

## Troubleshooting

### Error: "Cannot stitch episode: Missing segments"

**Cause**: One or more segments are missing or not ready.

**Fix**: 
1. Check segment status: `npx tsx crew_cloudia/audio/test-check-readiness.ts <date>`
2. Run audio worker if segments are `pending`: `npm run audio-worker`

### Error: "Failed to download <path>"

**Cause**: Segment MP3 doesn't exist in storage (path mismatch or upload failed).

**Fix**:
1. Verify `audio_storage_path` in `cloudia_segments` table
2. Check if file exists in Supabase storage dashboard
3. Re-run audio worker for that segment

### Error: "ffmpeg: No such file or directory"

**Cause**: `ffmpeg` is not installed or not in PATH.

**Fix**: Install ffmpeg:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

### Error: "Stitched audio has gaps/corruption"

**Cause**: Naive byte concatenation or MP3 frame misalignment.

**Fix**: This shouldn't happen with ffmpeg concat demuxer. If it does:
1. Check ffmpeg version: `ffmpeg -version`
2. Verify segment MP3s are valid: `ffprobe <segment.mp3>`
3. Report issue with ffmpeg command output

## Automated Stitching (Optional)

Use the stitch worker to automatically stitch episodes as segments become ready:

```bash
# Single run
npx tsx crew_cloudia/audio/worker/runStitchWorkerOnce.ts

# With options
npx tsx crew_cloudia/audio/worker/runStitchWorkerOnce.ts --limit 5 --program cloudia
```

The worker:
- Queries for episodes with all segments ready
- Checks if episode MP3 already exists (skips if yes)
- Stitches missing episodes (up to `limit` per run)
- Continues on errors (doesn't fail entire batch)

## Integration with Batch Runner

The stitch worker is **separate** from the batch runner by design:

1. **Batch runner** (`runEpisodeBatch.ts`): Generates scripts → marks segments ready for audio
2. **Audio worker** (`runAudioWorkerLoop.ts`): Generates segment audio → marks segments ready
3. **Stitch worker** (`runStitchWorkerOnce.ts`): Stitches episodes when all segments ready

This separation allows:
- Audio generation to happen asynchronously (can take time)
- Stitching to happen independently (can retry if needed)
- No blocking in the main batch pipeline

To run a full pipeline:
```bash
# 1. Generate scripts
npx tsx crew_cloudia/runner/runEpisodeBatch.ts cloudia 2026-01-20 --scripts-only

# 2. Generate audio (runs continuously)
npm run audio-worker

# 3. Stitch episodes (run periodically or after audio completes)
npx tsx crew_cloudia/audio/worker/runStitchWorkerOnce.ts
```
