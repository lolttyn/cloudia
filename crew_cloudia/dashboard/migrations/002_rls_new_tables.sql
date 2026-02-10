-- Phase 1 Step 2: RLS on new tables only (Section 3c first block)
-- Run in Supabase SQL Editor after 001_new_tables.sql

ALTER TABLE dashboard_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE regeneration_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON dashboard_approvals
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON dashboard_approvals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_select" ON regeneration_requests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON regeneration_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
