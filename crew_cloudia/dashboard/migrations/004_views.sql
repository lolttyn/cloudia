-- Phase 1 Step 4: Dashboard views (Section 4a, 4b)
-- Run after 003. If view fails on audio_last_error, table may use audio_error_message/audio_error_class.

-- 4a. dashboard_episode_list
CREATE OR REPLACE VIEW dashboard_episode_list AS
SELECT
  cs.episode_id,
  cs.episode_date,

  COALESCE(
    (SELECT da.decision FROM dashboard_approvals da
     WHERE da.episode_id = cs.episode_id
     ORDER BY da.decided_at DESC LIMIT 1),
    'pending'
  ) AS human_approval_status,

  (SELECT eegr.decision FROM editorial_episode_gate_results eegr
   WHERE eegr.episode_id = cs.episode_id
   ORDER BY eegr.evaluated_at DESC LIMIT 1
  ) AS gate_decision,

  LEFT(MAX(CASE WHEN cs.segment_key = 'intro' THEN cs.script_text END), 100) AS intro_preview,

  COUNT(*) AS segment_count,
  COUNT(*) FILTER (WHERE cs.audio_status = 'ready') AS segments_with_audio,
  COUNT(*) FILTER (WHERE cs.audio_status IN ('pending', 'generating')) AS segments_audio_in_progress,

  EXISTS (
    SELECT 1 FROM regeneration_requests rr
    WHERE rr.episode_id = cs.episode_id AND rr.status = 'pending'
  ) AS has_pending_regen

FROM cloudia_segments cs
GROUP BY cs.episode_id, cs.episode_date
ORDER BY cs.episode_date DESC;

-- 4b. dashboard_episode_detail (excludes tts_voice_id, tts_model_id)
-- Uses COALESCE for audio error columns in case DB has audio_error_message/audio_error_class instead of audio_last_error/audio_last_error_class
CREATE OR REPLACE VIEW dashboard_episode_detail AS
SELECT
  cs_agg.episode_id,
  cs_agg.episode_date,

  (SELECT jsonb_build_object(
    'status', da.decision,
    'notes', da.notes,
    'decided_by', da.decided_by,
    'decided_at', da.decided_at
  ) FROM dashboard_approvals da
   WHERE da.episode_id = cs_agg.episode_id
   ORDER BY da.decided_at DESC LIMIT 1
  ) AS human_approval,

  (SELECT jsonb_build_object(
    'decision', eegr.decision,
    'failed_segments', eegr.failed_segments,
    'policy_version', eegr.policy_version,
    'evaluated_at', eegr.evaluated_at
  ) FROM editorial_episode_gate_results eegr
   WHERE eegr.episode_id = cs_agg.episode_id
   ORDER BY eegr.evaluated_at DESC LIMIT 1
  ) AS gate_result,

  jsonb_object_agg(
    cs_agg.segment_key,
    jsonb_build_object(
      'id', cs_agg.id,
      'script_text', cs_agg.script_text,
      'script_version', cs_agg.script_version,
      'gate_decision', cs_agg.gate_decision,
      'audio_status', cs_agg.audio_status,
      'audio_storage_path', cs_agg.audio_storage_path,
      'audio_duration_seconds', cs_agg.audio_duration_seconds,
      'audio_last_error', cs_agg.audio_last_error,
      'audio_attempt_count', cs_agg.audio_attempt_count
    )
  ) AS segments,

  (SELECT jsonb_object_agg(sub.segment_key, sub.gate_detail)
   FROM (
     SELECT DISTINCT ON (egr.segment_key)
       egr.segment_key,
       jsonb_build_object(
         'decision', egr.decision,
         'is_approved', egr.is_approved,
         'blocking_reasons', egr.blocking_reasons,
         'warnings', egr.warnings,
         'rewrite_instructions', egr.rewrite_instructions,
         'evaluated_at', egr.evaluated_at
       ) AS gate_detail
     FROM editorial_gate_results egr
     WHERE egr.episode_id = cs_agg.episode_id
     ORDER BY egr.segment_key, egr.evaluated_at DESC
   ) sub
  ) AS segment_gate_details,

  (SELECT jsonb_agg(jsonb_build_object(
    'id', rr.id,
    'segments', rr.segments,
    'feedback', rr.feedback,
    'status', rr.status,
    'created_at', rr.created_at,
    'completed_at', rr.completed_at,
    'result_notes', rr.result_notes
  ) ORDER BY rr.created_at DESC)
   FROM regeneration_requests rr
   WHERE rr.episode_id = cs_agg.episode_id
  ) AS regeneration_history,

  (SELECT jsonb_agg(jsonb_build_object(
    'segment_key', csv.segment_key,
    'attempt_number', csv.attempt_number,
    'script_text', csv.script_text,
    'gate_decision', csv.gate_decision,
    'blocking_reasons', csv.blocking_reasons,
    'created_at', csv.created_at
  ) ORDER BY csv.segment_key, csv.attempt_number)
   FROM cloudia_segment_versions csv
   WHERE csv.episode_id = cs_agg.episode_id
  ) AS version_history

FROM cloudia_segments cs_agg
GROUP BY cs_agg.episode_id, cs_agg.episode_date;
