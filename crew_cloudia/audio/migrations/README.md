# Audio RPC Function Migrations

## Step 24: Apply Option B Semantics

This migration implements Option B: `audio_attempt_count` = number of failures (not claims).

### Prerequisites

1. Query current function definitions from Supabase:
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
   SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
   ```

2. Save the current function bodies (for rollback if needed)

### Changes Required

#### 1. `audio_claim_pending_segment`

**Remove this line from the UPDATE:**
```sql
audio_attempt_count = cs.audio_attempt_count + 1,
```

**Keep these lines:**
```sql
audio_status = 'generating',
audio_updated_at = now(),
audio_job_key = p_job_key
```

#### 2. `audio_mark_failed`

**Add this line to the UPDATE:**
```sql
audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1,
```

**Keep existing lines:**
```sql
audio_status = 'failed',
audio_error_class = p_error_class,
audio_error_message = p_error_message,
audio_updated_at = now()
```

### Application Steps

1. **Get current function bodies:**
   - Use Supabase SQL editor or `psql`
   - Query `pg_proc.prosrc` for both functions

2. **Edit the function bodies:**
   - Remove increment from `audio_claim_pending_segment`
   - Add increment to `audio_mark_failed`

3. **Apply using `CREATE OR REPLACE FUNCTION`:**
   ```sql
   CREATE OR REPLACE FUNCTION audio_claim_pending_segment(...) AS $$ ... $$;
   CREATE OR REPLACE FUNCTION audio_mark_failed(...) AS $$ ... $$;
   ```

4. **Verify changes:**
   ```sql
   -- Should NOT contain increment
   SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
   
   -- Should contain increment
   SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
   ```

### Rollback

If needed, restore the original function bodies from your saved copies.

### Testing

After applying:
1. Mark a segment as `pending`
2. Claim it → `audio_attempt_count` should remain unchanged
3. Mark it as `failed` → `audio_attempt_count` should increment by 1
