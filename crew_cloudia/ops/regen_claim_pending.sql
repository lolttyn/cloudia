-- Run in Supabase SQL Editor.
-- Atomically claims one pending regeneration request (oldest first) by setting status to 'processing'.
-- Returns the claimed row, or no rows if none pending. Use FOR UPDATE SKIP LOCKED so only one worker gets each row.

CREATE OR REPLACE FUNCTION regen_claim_pending()
RETURNS SETOF regeneration_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE regeneration_requests r
  SET status = 'processing'
  FROM (
    SELECT id FROM regeneration_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) sub
  WHERE r.id = sub.id
  RETURNING r.*;
END;
$$;
