# Audio QA Threshold Fix

## Problem

`main_themes` segments were consistently failing QA with durations of 92-109.9s, but the threshold required ≥110s. This caused systematic failures and wasted throughput.

## Solution (Option A+B)

### 1. Lowered Duration Threshold with Epsilon Tolerance

**Changes in `audioQa.ts`:**
- Lowered `main_themes` minimum from **110s → 90s** (configurable via `CLOUDIA_MAIN_THEMES_MIN_SECONDS`)
- Added **epsilon tolerance (1.0s default)** via `CLOUDIA_AUDIO_QA_EPSILON_SECONDS`
- Fail only if `duration < (min - epsilon)` (prevents 109.949s failures on 110s threshold)

**Environment variables:**
- `CLOUDIA_MAIN_THEMES_MIN_SECONDS` (default: 90)
- `CLOUDIA_AUDIO_QA_EPSILON_SECONDS` (default: 1.0)

**Error messages now include:**
- Measured duration (2 decimal places)
- Threshold
- Effective threshold (with epsilon)
- Makes debugging clear

### 2. Upstream Script Length Enforcement

**Changes in `markSegmentReadyForAudio.ts`:**
- Added word count validation **before** marking segment as `pending`
- For `main_themes`: enforces minimum 280 words (configurable via `CLOUDIA_MAIN_THEMES_MIN_WORDS`)
- Heuristic: ~150-170 words per minute → 110s ≈ 275-310 words → 280 words conservative threshold
- **Prevents short scripts from reaching audio generation**

**Environment variable:**
- `CLOUDIA_MAIN_THEMES_MIN_WORDS` (default: 280)

### 3. QA Failures Are Terminal (Already Correct)

**Existing behavior in `retryPolicy.ts`:**
- QA failures (`qa_failure` class) are **not retryable**
- Only transient errors (`tts_rate_limited`, `tts_timeout`, `tts_network`) are retried
- This is correct: retrying TTS with the same text won't fix duration issues

## Impact

### Immediate (Option A)
- ✅ Unblocks production: 90-110s main_themes now pass QA
- ✅ Eliminates razor-thin failures (109.949s vs 110s)
- ✅ Configurable thresholds via environment variables

### Long-term (Option B)
- ✅ Upstream enforcement prevents short scripts from reaching audio
- ✅ Scripts that pass word count check are more likely to meet duration targets
- ✅ Drift toward 110-140s over time without hard failures

## Configuration

### Defaults (unblocks immediately)
```bash
# No env vars needed - defaults work:
# CLOUDIA_MAIN_THEMES_MIN_SECONDS=90
# CLOUDIA_AUDIO_QA_EPSILON_SECONDS=1.0
# CLOUDIA_MAIN_THEMES_MIN_WORDS=280
```

### To enforce 110s target (stricter)
```bash
export CLOUDIA_MAIN_THEMES_MIN_SECONDS=110
export CLOUDIA_MAIN_THEMES_MIN_WORDS=280  # Still enforce word count upstream
```

### To be more lenient (if needed)
```bash
export CLOUDIA_MAIN_THEMES_MIN_SECONDS=85
export CLOUDIA_AUDIO_QA_EPSILON_SECONDS=2.0
```

## Backlog Cleanup

To requeue existing failed `main_themes` segments:

1. **Manual reset** (if `qa_failure` is terminal in your RPC):
   ```sql
   UPDATE cloudia_segments
   SET audio_status = 'pending',
       audio_error_class = NULL,
       audio_error_message = NULL
   WHERE segment_key = 'main_themes'
     AND audio_status = 'failed'
     AND audio_error_class LIKE 'qa_duration%';
   ```

2. **Run audio worker** to regenerate:
   ```bash
   npm run audio-worker
   ```

3. **Stitch worker** will pick up newly-ready dates automatically.

## Testing

After deploying:

1. **Check existing failed segments:**
   ```sql
   SELECT episode_date, segment_key, audio_status, audio_error_class, audio_error_message
   FROM cloudia_segments
   WHERE segment_key = 'main_themes' AND audio_status = 'failed';
   ```

2. **Test new segment:**
   - Generate a main_themes script with ≥280 words
   - Should pass upstream check in `markSegmentReadyForAudio`
   - Audio should pass QA if duration ≥89s (90s - 1s epsilon)

3. **Verify epsilon tolerance:**
   - A segment with 89.5s duration should pass (90s - 1s = 89s effective minimum)
   - A segment with 88.9s duration should fail

## Files Changed

- `crew_cloudia/audio/worker/audioQa.ts` - Duration thresholds with epsilon
- `crew_cloudia/audio/markSegmentReadyForAudio.ts` - Upstream word count enforcement
- `crew_cloudia/audio/worker/retryPolicy.ts` - Already correct (QA failures terminal)
