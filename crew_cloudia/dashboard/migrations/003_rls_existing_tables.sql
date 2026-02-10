-- Phase 1 Step 3: RLS on existing pipeline tables (Section 3c second block)
-- Run after 002. Ensure .env has SUPABASE_SERVICE_ROLE_KEY set before running.

ALTER TABLE cloudia_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloudia_segment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_episode_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_gate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON cloudia_segments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_select" ON cloudia_segment_versions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_select" ON editorial_gate_results
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_select" ON editorial_episode_gate_results
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_select" ON editorial_gate_overrides
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_select" ON batch_runs
  FOR SELECT USING (auth.role() = 'authenticated');
