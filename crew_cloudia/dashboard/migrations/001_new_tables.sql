-- Phase 1 Step 1: dashboard_approvals and regeneration_requests (Section 3a, 3b)
-- Run in Supabase SQL Editor, then commit.

-- 3a. dashboard_approvals
CREATE TABLE dashboard_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL,
  episode_date DATE NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved', 'rejected')),
  notes TEXT,
  decided_by TEXT DEFAULT 'justin',
  decided_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dashboard_approvals_episode_id ON dashboard_approvals(episode_id);
CREATE INDEX idx_dashboard_approvals_episode_date ON dashboard_approvals(episode_date);

-- 3b. regeneration_requests
CREATE TABLE regeneration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL,
  episode_date DATE NOT NULL,
  segments TEXT[] NOT NULL,
  feedback TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result_notes TEXT
);

CREATE INDEX idx_regen_requests_episode_id ON regeneration_requests(episode_id);
CREATE INDEX idx_regen_requests_status ON regeneration_requests(status);
