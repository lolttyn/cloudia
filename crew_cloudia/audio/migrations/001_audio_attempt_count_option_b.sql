-- Migration: Implement Option B semantics for audio_attempt_count
-- 
-- Changes:
-- 1. audio_claim_pending_segment: Remove increment of audio_attempt_count
-- 2. audio_mark_failed: Add increment of audio_attempt_count
--
-- Semantics: audio_attempt_count = number of failures (not number of claims)
--
-- To apply:
-- 1. Query current function definitions: 
--    SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
--    SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
-- 2. Update the functions using CREATE OR REPLACE FUNCTION with the modified bodies below
-- 3. Verify: Re-query prosrc to confirm changes

-- ============================================================================
-- 1. audio_claim_pending_segment: Remove audio_attempt_count increment
-- ============================================================================
-- 
-- BEFORE (remove this line from the UPDATE):
--   audio_attempt_count = cs.audio_attempt_count + 1,
--
-- AFTER: Remove that line entirely. The UPDATE should only set:
--   audio_status = 'generating',
--   audio_updated_at = now(),
--   audio_job_key = p_job_key
--
-- Example updated function body (adjust based on your actual function):
/*
CREATE OR REPLACE FUNCTION audio_claim_pending_segment(
  p_episode_id uuid,
  p_segment_key text,
  p_job_key text
)
RETURNS TABLE (
  episode_id uuid,
  segment_key text,
  audio_status text,
  audio_attempt_count integer,
  -- ... other columns
) 
LANGUAGE plpgsql
AS $$
DECLARE
  cs cloudia_segments%ROWTYPE;
BEGIN
  UPDATE cloudia_segments cs
  SET 
    audio_status = 'generating',
    audio_updated_at = now(),
    audio_job_key = p_job_key
    -- REMOVED: audio_attempt_count = cs.audio_attempt_count + 1,
  WHERE cs.episode_id = p_episode_id
    AND cs.segment_key = p_segment_key
    AND cs.audio_status = 'pending'
  RETURNING * INTO cs;
  
  RETURN QUERY SELECT * FROM cloudia_segments WHERE episode_id = p_episode_id AND segment_key = p_segment_key;
END;
$$;
*/

-- ============================================================================
-- 2. audio_mark_failed: Add audio_attempt_count increment
-- ============================================================================
--
-- BEFORE: The UPDATE does not increment audio_attempt_count
--
-- AFTER: Add this line to the UPDATE:
--   audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1,
--
-- Example updated function body (adjust based on your actual function):
/*
CREATE OR REPLACE FUNCTION audio_mark_failed(
  p_episode_id uuid,
  p_segment_key text,
  p_job_key text,
  p_error_class text,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cs cloudia_segments%ROWTYPE;
BEGIN
  UPDATE cloudia_segments cs
  SET 
    audio_status = 'failed',
    audio_error_class = p_error_class,
    audio_error_message = p_error_message,
    audio_updated_at = now(),
    -- ADDED: Increment failure count
    audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1
  WHERE cs.episode_id = p_episode_id
    AND cs.segment_key = p_segment_key
    AND cs.audio_status = 'generating'
    AND cs.audio_job_key = p_job_key;
END;
$$;
*/

-- ============================================================================
-- Verification queries (run after applying changes)
-- ============================================================================

-- Verify audio_claim_pending_segment does NOT increment:
-- SELECT prosrc FROM pg_proc WHERE proname = 'audio_claim_pending_segment';
-- Should NOT contain: audio_attempt_count = ... + 1

-- Verify audio_mark_failed DOES increment:
-- SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
-- Should contain: audio_attempt_count = COALESCE(...) + 1
