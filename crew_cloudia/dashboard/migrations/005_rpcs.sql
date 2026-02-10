-- Phase 1 Step 5: RPCs (Section 5a, 5b, 5c)
-- Run after 004.

-- 5a. approve_episode
CREATE OR REPLACE FUNCTION approve_episode(
  p_episode_id UUID,
  p_episode_date DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO dashboard_approvals (episode_id, episode_date, decision, notes)
  VALUES (p_episode_id, p_episode_date, 'approved', p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5b. reject_episode
CREATE OR REPLACE FUNCTION reject_episode(
  p_episode_id UUID,
  p_episode_date DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO dashboard_approvals (episode_id, episode_date, decision, notes)
  VALUES (p_episode_id, p_episode_date, 'rejected', p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5c. request_regeneration
CREATE OR REPLACE FUNCTION request_regeneration(
  p_episode_id UUID,
  p_episode_date DATE,
  p_segments TEXT[],
  p_feedback TEXT
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF length(p_feedback) > 1000 THEN
    RAISE EXCEPTION 'Feedback exceeds maximum length of 1000 characters';
  END IF;

  IF NOT (p_segments <@ ARRAY['intro', 'main_themes', 'closing']) THEN
    RAISE EXCEPTION 'Invalid segment key(s). Must be intro, main_themes, or closing.';
  END IF;

  IF array_length(p_segments, 1) IS NULL OR array_length(p_segments, 1) = 0 THEN
    RAISE EXCEPTION 'Must specify at least one segment to regenerate.';
  END IF;

  INSERT INTO regeneration_requests (episode_id, episode_date, segments, feedback)
  VALUES (p_episode_id, p_episode_date, p_segments, p_feedback)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
