-- ============================================================================
-- Step 24.2: Update audio_mark_failed to increment audio_attempt_count
-- ============================================================================
--
-- CHANGE: Added audio_attempt_count increment in UPDATE block
-- Line added: audio_attempt_count = coalesce(cs.audio_attempt_count, 0) + 1,
-- Position: Immediately after audio_status = 'failed',
--
-- ============================================================================
-- COMPLETE UPDATED FUNCTION DDL (copy/paste and run):
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audio_mark_failed(p_episode_id uuid, p_segment_key text, p_job_key text, p_error_class text, p_error_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status text;
  v_current_job_key text;
begin
  select cs.audio_status, cs.audio_job_key
    into v_status, v_current_job_key
  from public.cloudia_segments cs
  where cs.episode_id = p_episode_id
    and cs.segment_key = p_segment_key
  for update;

  if not found then
    raise exception 'Segment not found for episode_id=% segment_key=%', p_episode_id, p_segment_key;
  end if;

  -- Idempotency: if already failed with same job_key, no-op
  if v_status = 'failed' and v_current_job_key = p_job_key then
    return;
  end if;

  if v_status is distinct from 'generating' then
    raise exception 'Cannot mark failed from status=% (episode_id=% segment_key=%)', v_status, p_episode_id, p_segment_key;
  end if;

  if v_current_job_key is distinct from p_job_key then
    raise exception 'Job key mismatch: expected=% got=% (episode_id=% segment_key=%)', v_current_job_key, p_job_key, p_episode_id, p_segment_key;
  end if;

  update public.cloudia_segments cs
     set audio_status = 'failed',
         audio_attempt_count = coalesce(cs.audio_attempt_count, 0) + 1,
         audio_last_error_class = left(coalesce(p_error_class,''), 200),
         audio_last_error = left(coalesce(p_error_message,''), 4000),
         audio_updated_at = now()
   where cs.episode_id = p_episode_id
     and cs.segment_key = p_segment_key;
end;
$function$;

-- ============================================================================
-- VERIFICATION (run after applying):
-- ============================================================================

SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%audio_attempt_count%+%1%' OR prosrc LIKE '%audio_attempt_count%+ 1%' THEN '✅ Increment found'
    ELSE '❌ NO INCREMENT (needs fix)'
  END as status
FROM pg_proc 
WHERE proname = 'audio_mark_failed';
