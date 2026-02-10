-- Stale regeneration cleanup: add processing_started_at and update claim RPC.
-- Run in Supabase SQL Editor after 001–005. Enables 15-minute TTL for rows stuck in processing.

-- Add column so we know when a row entered processing (set by regen_claim_pending).
ALTER TABLE regeneration_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Replace claim function to set processing_started_at when claiming.
CREATE OR REPLACE FUNCTION regen_claim_pending()
RETURNS SETOF regeneration_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE regeneration_requests r
  SET status = 'processing',
      processing_started_at = now()
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
