-- ============================================================================
-- Step 24: Apply Option B Semantics for audio_attempt_count
-- ============================================================================
-- 
-- This script shows the exact changes needed. 
-- 
-- BEFORE running: Query current function definitions:
--   SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
--   SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
--
-- Then edit those function bodies as shown below and run CREATE OR REPLACE.
-- ============================================================================

-- ============================================================================
-- STEP 1: Fetch current function definitions
-- ============================================================================

-- Run these queries first to see current function bodies:
-- SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
-- SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';

-- ============================================================================
-- STEP 2: Update audio_claim_pending_segment
-- ============================================================================
--
-- In the UPDATE statement, REMOVE this line:
--   audio_attempt_count = cs.audio_attempt_count + 1,
--
-- The UPDATE should only set:
--   - audio_status = 'generating'
--   - audio_updated_at = now()
--   - audio_job_key = p_job_key
--   - (any other fields you currently set)
--
-- Then run: CREATE OR REPLACE FUNCTION audio_claim_pending_segment(...) AS $$ ... $$;

-- ============================================================================
-- STEP 3: Update audio_mark_failed
-- ============================================================================
--
-- In the UPDATE statement, ADD this line:
--   audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1,
--
-- Place it with the other SET clauses, e.g.:
--   SET 
--     audio_status = 'failed',
--     audio_error_class = p_error_class,
--     audio_error_message = p_error_message,
--     audio_updated_at = now(),
--     audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1  -- ADD THIS
--
-- Then run: CREATE OR REPLACE FUNCTION audio_mark_failed(...) AS $$ ... $$;

-- ============================================================================
-- STEP 4: Verify changes
-- ============================================================================

-- Verify audio_claim_pending_segment does NOT increment:
SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%audio_attempt_count%+%1%' THEN '❌ STILL INCREMENTS (needs fix)'
    ELSE '✅ No increment found'
  END as status
FROM pg_proc 
WHERE proname = 'audio_claim_pending_segment';

-- Verify audio_mark_failed DOES increment:
SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%audio_attempt_count%+%1%' THEN '✅ Increment found'
    ELSE '❌ NO INCREMENT (needs fix)'
  END as status
FROM pg_proc 
WHERE proname = 'audio_mark_failed';

-- ============================================================================
-- STEP 5: Test (optional, run in Supabase SQL editor)
-- ============================================================================

-- Test 1: Claim should NOT increment
-- UPDATE cloudia_segments SET audio_status = 'pending', audio_attempt_count = 0 
-- WHERE episode_id = '...' AND segment_key = 'intro';
-- SELECT audio_attempt_count FROM cloudia_segments WHERE ...;  -- Should be 0
-- SELECT * FROM audio_claim_pending_segment('...', 'intro', 'test-key');
-- SELECT audio_attempt_count FROM cloudia_segments WHERE ...;  -- Should still be 0

-- Test 2: Mark failed SHOULD increment
-- (Segment must be in 'generating' state with matching job_key)
-- SELECT * FROM audio_mark_failed('...', 'intro', 'test-key', 'test_error', 'test message');
-- SELECT audio_attempt_count FROM cloudia_segments WHERE ...;  -- Should be 1
