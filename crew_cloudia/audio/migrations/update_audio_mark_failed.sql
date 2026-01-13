-- ============================================================================
-- Step 24.2: Update audio_mark_failed to increment audio_attempt_count
-- ============================================================================
--
-- First, get the current function definition:
-- SELECT prosrc FROM pg_proc WHERE proname = 'audio_mark_failed';
--
-- Then modify it to add the increment line in the UPDATE SET clause.
-- ============================================================================

-- Example: If your current function looks like this:
/*
CREATE OR REPLACE FUNCTION public.audio_mark_failed(
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
    audio_updated_at = now()
    -- ADD THIS LINE:
    audio_attempt_count = COALESCE(cs.audio_attempt_count, 0) + 1
  WHERE cs.episode_id = p_episode_id
    AND cs.segment_key = p_segment_key
    AND cs.audio_status = 'generating'
    AND cs.audio_job_key = p_job_key;
END;
$$;
*/

-- ============================================================================
-- Verification query (run after applying):
-- ============================================================================

SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%audio_attempt_count%+%1%' OR prosrc LIKE '%audio_attempt_count%+ 1%' THEN '✅ Increment found'
    ELSE '❌ NO INCREMENT (needs fix)'
  END as status,
  -- Show the relevant line if found
  CASE 
    WHEN prosrc LIKE '%audio_attempt_count%+%1%' OR prosrc LIKE '%audio_attempt_count%+ 1%' THEN 
      substring(prosrc from 'audio_attempt_count[^;]+')
    ELSE 'Not found'
  END as increment_line
FROM pg_proc 
WHERE proname = 'audio_mark_failed';
