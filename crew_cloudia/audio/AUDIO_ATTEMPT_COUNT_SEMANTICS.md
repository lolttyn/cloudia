# Audio Attempt Count Semantics (Option B)

## Definition

**`audio_attempt_count` = number of failures** (not number of claims)

## Implementation

### Database RPCs (Supabase)

**`audio_claim_pending_segment`:**
- **MUST NOT** increment `audio_attempt_count`
- Only updates `audio_status = 'generating'` and sets `audio_updated_at`
- Returns current `audio_attempt_count` value (for retry decisions)

**`audio_mark_failed`:**
- **MUST** increment `audio_attempt_count` by 1
- Sets `audio_status = 'failed'`
- Records error details

**`audio_mark_ready`:**
- Does not modify `audio_attempt_count`
- Sets `audio_status = 'ready'`
- On success, failure count remains unchanged (represents historical failures for this segment version)

### TypeScript Code

**`runAudioWorkerOnce.ts`:**
- Reads `audio_attempt_count` from claim result (current failure count)
- Uses `currentFailureCount + 1` for retry decision (since `audio_mark_failed` will increment it)
- Retry logic: if `failureCountAfterThisFailure >= 3`, don't retry

**`retryPolicy.ts`:**
- `decideRetry` receives failure count (after current failure is recorded)
- Max 3 failures = terminal failure

## Migration Notes

**Existing data:**
- Segments with high `audio_attempt_count` (e.g., 10) likely represent repeated claims, not failures
- After migration, these should be reset to 0 (or actual failure count if known)
- New failures will increment correctly going forward

**RPC Migration:**
1. Update `audio_claim_pending_segment` to remove `audio_attempt_count = audio_attempt_count + 1`
2. Update `audio_mark_failed` to add `audio_attempt_count = audio_attempt_count + 1`
3. Verify `audio_mark_ready` does not modify `audio_attempt_count`

## Benefits

- **Clear semantics**: Count directly represents failures, useful for alerting
- **Alerting**: `audio_attempt_count >= 3 AND audio_status = 'failed'` = terminal failure
- **Operational clarity**: High count = repeated failures, not just repeated claims
- **Retry logic**: Aligns with "max 3 failures" policy

## Example Flow

1. Segment marked `pending` → `audio_attempt_count = 0`
2. Worker claims → `audio_status = 'generating'`, `audio_attempt_count` still `0`
3. Generation fails → `audio_mark_failed` → `audio_status = 'failed'`, `audio_attempt_count = 1`
4. Retry decision: `1 + 1 = 2` < 3 → requeue for retry
5. Worker claims again → `audio_status = 'generating'`, `audio_attempt_count` still `1`
6. Generation fails again → `audio_mark_failed` → `audio_attempt_count = 2`
7. Retry decision: `2 + 1 = 3` >= 3 → terminal, don't retry
