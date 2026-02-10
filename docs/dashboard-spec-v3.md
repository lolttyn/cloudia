# Cloudia Review Dashboard — Build Spec v3

**Version:** 3.0
**Date:** 2026-02-10
**Purpose:** Single source of truth for building the Cloudia editorial review dashboard. Defines the data contract between the backend (Supabase, managed by Cursor) and the frontend (Lovable).

**Revision history:**
- v1.0: Initial spec based on assumed schema.
- v2.0: Updated to reflect actual Supabase schema dump.
- v2.1: Incorporated Cursor's answers to open questions (gate values, audio status, storage paths).
- v3.0: Full rewrite based on comprehensive Cursor codebase review. Corrected project status (scheduling and publishing foundations exist), added all RPCs, refined views against verified column names, added segment audio path details.

---

## 1. Ownership Boundaries

| Concern | Owner | Tools |
|---|---|---|
| Database schema, views, RPC functions, RLS policies | Cursor | Supabase SQL |
| Auth configuration | Cursor | Supabase Auth |
| Pipeline changes (regeneration polling, feedback injection) | Cursor | TypeScript in crew_cloudia/ |
| Frontend UI, routing, components, styling | Lovable | React + Supabase JS client |
| Audio playback, copy-to-clipboard, file downloads | Lovable | Browser APIs |
| Specs, architecture decisions, coordination, security review | Claude | This document |

**Rule:** Lovable connects to Supabase directly via `@supabase/supabase-js`. No separate API server. No backend logic in the frontend beyond calling views and RPCs.

---

## 2. System Context (What Already Exists)

### 2a. Pipeline State (as of 2026-02-10)

| Capability | Status | Notes |
|---|---|---|
| L0/L1 seed + load (sky state, daily facts) | ✅ Working | Swiss Ephemeris via npm `swisseph` |
| L2 interpretation (canonical + legacy) | ✅ Working | Parity tests in place |
| L3/L4 segment generation (intro, main_themes, closing) | ✅ Working | Single-pass, gate enforced |
| Editorial gates (segment + episode level) | ✅ Working | approve/block/rewrite + ship/fail |
| Segment versioning | ✅ Working | cloudia_segment_versions with attempt_number |
| Audio TTS (ElevenLabs) | ✅ Working | Worker loop with claim/generate/ready/failed |
| Episode stitching (FFmpeg) | ✅ Working | Stitch worker finds ready segments |
| Batch runner | ✅ Working | Preseed → generate → gate → audio mark |
| Weekly script scheduling | ✅ Working | Sunday 7am PT, time-guarded |
| Daily stitch scheduling | ✅ Working | Weekday 8am PT, time-guarded |
| Batch run management | ✅ Working | claim/complete/fail/fail_stale RPCs |
| Publishing | ⚠️ Partial | Adapter interface exists, only localOnlyPublisher implemented. No external_id persistence. |
| Human approval UI | ❌ Not built | **This is what we're building** |
| RLS / auth | ❌ Not configured | No RLS on any table, no auth users |
| Supabase views | ❌ None exist | Dashboard will be the first consumer |

### 2b. Existing Tables (Read-Only from Dashboard's Perspective)

The dashboard **reads** from these but **never writes** to them.

**`cloudia_segments`** — Current approved script + audio state per segment
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `episode_id` | uuid | Groups segments into episode |
| `episode_date` | date | Display, filtering |
| `segment_key` | text | `'intro'` / `'main_themes'` / `'closing'` |
| `script_text` | text | Display in review |
| `script_version` | integer | Display version number |
| `gate_decision` | text | Always `'approve'` in this table |
| `gate_policy_version` | text | — |
| `audio_status` | text (nullable) | `'pending'` / `'generating'` / `'ready'` / `'failed'` / `NULL` |
| `audio_storage_path` | text (nullable) | Used for signed URL generation |
| `audio_duration_seconds` | numeric (nullable) | Display duration |
| `audio_path` | text (nullable) | Legacy/alternate path |
| `audio_checksum_sha256` | text (nullable) | — |
| `audio_codec` | text (nullable) | — |
| `audio_sample_rate_hz` | integer (nullable) | — |
| `audio_job_key` | text (nullable) | Internal |
| `audio_attempt_count` | integer | Display if relevant |
| `audio_last_error` | text (nullable) | Display on failure |
| `audio_last_error_class` | text (nullable) | Display on failure |
| `audio_updated_at` | timestamptz | — |
| `updated_at` | timestamptz | — |
| `tts_voice_id` | text (nullable) | **⛔ NEVER expose to frontend** |
| `tts_model_id` | text (nullable) | **⛔ NEVER expose to frontend** |

**`cloudia_segment_versions`** — All generation attempts (append-only history)
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `episode_id` | uuid | Join to episode |
| `episode_date` | date | — |
| `segment_key` | text | — |
| `attempt_number` | integer | Display in history |
| `script_text` | text | Display previous versions |
| `gate_decision` | text | `'approve'` / `'block'` / `'rewrite'` |
| `blocking_reasons` | text[] | Display in history |
| `gate_policy_version` | text | — |
| `batch_id` | uuid | FK to batch_runs |
| `created_at` | timestamptz | Display timestamp |

**`editorial_gate_results`** — Per-segment gate evaluations
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `episode_id` | uuid | — |
| `segment_key` | text | — |
| `episode_date` | date | — |
| `decision` | text | `'approve'` / `'block'` / `'rewrite'` |
| `is_approved` | boolean | Quick check |
| `blocking_reasons` | text[] | Display |
| `warnings` | text[] | Display |
| `rewrite_instructions` | jsonb (nullable) | Display if present |
| `policy_version` | text | — |
| `evaluated_at` | timestamptz | — |
| `created_at` | timestamptz | — |

**`editorial_episode_gate_results`** — Episode-level gate evaluations
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `episode_id` | uuid | — |
| `episode_date` | date | — |
| `decision` | text | `'ship'` / `'fail'` |
| `failed_segments` | jsonb | Display which segments failed |
| `policy_version` | text | — |
| `evaluated_at` | timestamptz | — |
| `created_at` | timestamptz | — |

**`editorial_gate_overrides`** — Human override decisions (existing table, currently unused)
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `gate_result_id` | uuid | FK to editorial_gate_results |
| `override_decision` | text | — |
| `override_reason` | text | — |
| `overridden_by` | text (nullable) | — |
| `overridden_at` | timestamptz | — |
| `created_at` | timestamptz | — |

**`batch_runs`** — Pipeline execution log
| Column | Type | Dashboard Use |
|---|---|---|
| `id` | uuid | PK |
| `program_slug` | text | — |
| `start_date` | date | — |
| `window_days` | integer | — |
| `kind` | text | `'weekly_scripts'` / `'daily_stitch'` |
| `status` | text | — |
| `succeeded` | integer (nullable) | — |
| `failed` | integer (nullable) | — |
| `error_message` | text (nullable) | — |
| `completed_at` | timestamptz (nullable) | — |
| `claimed_at` | timestamptz | — |

**`astrology_daily_facts`** — L0/L1 data (read-only context)
- PK: `episode_date`
- Key field: `facts` (jsonb)

**`cloudia_daily_interpretation`** — L2 interpretation (read-only context)
- PK: `episode_date`
- Key field: `daily_interpretation` (jsonb)

**`sky_state_daily`** — Raw sky state (read-only context)
- PK: `episode_date`
- Key field: `sky_state` (jsonb)

### 2c. Existing RPCs (Do Not Modify)

| RPC | Purpose |
|---|---|
| `audio_claim_pending_segment` | Claim segment for TTS, set status to `generating` |
| `audio_mark_ready` | Set status to `ready` with path/duration/metadata |
| `audio_mark_failed` | Set status to `failed`, increment attempt count |
| `audio_requeue_stale_generating` | Requeue stuck segments |
| `audio_requeue_failed` | Requeue failed segments for retry |
| `claim_batch_run` | Claim a batch run |
| `complete_batch_run` | Mark batch run completed |
| `fail_batch_run` | Mark batch run failed |
| `fail_stale_batch_runs` | Mark stale runs failed |

### 2d. Storage

| Bucket | Public | Contents |
|---|---|---|
| `audio-private` | ❌ Private | All audio: segment MP3s + stitched episode MP3s |
| `episodes` | ❌ Private | Purpose unclear from code — stitch worker uses `audio-private` |

**Path patterns (in `audio-private`):**
- Segment audio: `cloudia/segments/{episodeDate}/{segmentKey}/v{scriptVersion}/{jobKey}.mp3`
- Stitched episode: `cloudia/episodes/{episodeDate}/episode.mp3`

### 2e. Existing Auth & RLS

- **Auth:** Not configured. No auth users, no sign-in flows. Backend is service-key only.
- **RLS:** Not enabled on any table. All access via `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS).
- **Views:** None exist.

---

## 3. New Schema (Cursor Builds)

### 3a. `dashboard_approvals` — Human approval/rejection decisions

Separate from the automated editorial gate system. The pipeline never reads this table. The dashboard writes to it.

```sql
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
```

**Design rationale:** We do NOT add columns to existing pipeline tables. The dashboard writes to its own table, and we join in views. This prevents any risk of the dashboard interfering with pipeline operations.

### 3b. `regeneration_requests` — Feedback loop for re-generation

```sql
CREATE TABLE regeneration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL,
  episode_date DATE NOT NULL,
  segments TEXT[] NOT NULL,          -- e.g. ARRAY['intro', 'closing']
  feedback TEXT NOT NULL,            -- human editorial direction for LLM
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result_notes TEXT                  -- system notes on outcome
);

CREATE INDEX idx_regen_requests_episode_id ON regeneration_requests(episode_id);
CREATE INDEX idx_regen_requests_status ON regeneration_requests(status);
```

### 3c. RLS Policies

```sql
-- Enable RLS on new tables
ALTER TABLE dashboard_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE regeneration_requests ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users only
CREATE POLICY "auth_select" ON dashboard_approvals
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON dashboard_approvals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_select" ON regeneration_requests
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert" ON regeneration_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Enable RLS on existing tables the dashboard reads from
-- SAFE because pipeline uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
ALTER TABLE cloudia_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloudia_segment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_episode_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_gate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_runs ENABLE ROW LEVEL SECURITY;

-- Read-only policies for dashboard
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
```

> **⚠️ CRITICAL:** Verify the pipeline's `.env` has `SUPABASE_SERVICE_ROLE_KEY` set (not just `SUPABASE_ANON_KEY`). If the pipeline falls back to the anon key, enabling RLS will break production writes. Check this BEFORE running the ALTER TABLE statements.

---

## 4. Supabase Views (Cursor Builds)

### 4a. `dashboard_episode_list`

One row per episode. Used by the Episode List screen.

```sql
CREATE OR REPLACE VIEW dashboard_episode_list AS
SELECT
  cs.episode_id,
  cs.episode_date,

  -- Human approval status (most recent decision, or 'pending')
  COALESCE(
    (SELECT da.decision FROM dashboard_approvals da
     WHERE da.episode_id = cs.episode_id
     ORDER BY da.decided_at DESC LIMIT 1),
    'pending'
  ) AS human_approval_status,

  -- Automated episode gate decision (most recent)
  (SELECT eegr.decision FROM editorial_episode_gate_results eegr
   WHERE eegr.episode_id = cs.episode_id
   ORDER BY eegr.evaluated_at DESC LIMIT 1
  ) AS gate_decision,

  -- Intro preview (first 100 chars)
  LEFT(MAX(CASE WHEN cs.segment_key = 'intro' THEN cs.script_text END), 100) AS intro_preview,

  -- Segment counts
  COUNT(*) AS segment_count,
  COUNT(*) FILTER (WHERE cs.audio_status = 'ready') AS segments_with_audio,
  COUNT(*) FILTER (WHERE cs.audio_status IN ('pending', 'generating')) AS segments_audio_in_progress,

  -- Has pending regeneration request?
  EXISTS (
    SELECT 1 FROM regeneration_requests rr
    WHERE rr.episode_id = cs.episode_id AND rr.status = 'pending'
  ) AS has_pending_regen

FROM cloudia_segments cs
GROUP BY cs.episode_id, cs.episode_date
ORDER BY cs.episode_date DESC;
```

### 4b. `dashboard_episode_detail`

One row per episode with nested JSON. Used by the Episode Detail screen.

**Note:** This view intentionally excludes `tts_voice_id` and `tts_model_id` from the segments JSON.

```sql
CREATE OR REPLACE VIEW dashboard_episode_detail AS
SELECT
  cs_agg.episode_id,
  cs_agg.episode_date,

  -- Human approval (most recent)
  (SELECT jsonb_build_object(
    'status', da.decision,
    'notes', da.notes,
    'decided_by', da.decided_by,
    'decided_at', da.decided_at
  ) FROM dashboard_approvals da
   WHERE da.episode_id = cs_agg.episode_id
   ORDER BY da.decided_at DESC LIMIT 1
  ) AS human_approval,

  -- Automated episode gate (most recent)
  (SELECT jsonb_build_object(
    'decision', eegr.decision,
    'failed_segments', eegr.failed_segments,
    'policy_version', eegr.policy_version,
    'evaluated_at', eegr.evaluated_at
  ) FROM editorial_episode_gate_results eegr
   WHERE eegr.episode_id = cs_agg.episode_id
   ORDER BY eegr.evaluated_at DESC LIMIT 1
  ) AS gate_result,

  -- Segments as JSON object (keyed by segment_key)
  -- EXCLUDES tts_voice_id and tts_model_id for security
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

  -- Per-segment gate details (most recent per segment)
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

  -- Regeneration history
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

  -- Version history (all generation attempts)
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
```

---

## 5. New RPC Functions (Cursor Builds)

### 5a. `approve_episode`

```sql
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
```

### 5b. `reject_episode`

```sql
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
```

### 5c. `request_regeneration`

```sql
CREATE OR REPLACE FUNCTION request_regeneration(
  p_episode_id UUID,
  p_episode_date DATE,
  p_segments TEXT[],
  p_feedback TEXT
) RETURNS UUID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  -- Validate feedback length (defense-in-depth against prompt injection)
  IF length(p_feedback) > 1000 THEN
    RAISE EXCEPTION 'Feedback exceeds maximum length of 1000 characters';
  END IF;

  -- Validate segment keys
  IF NOT (p_segments <@ ARRAY['intro', 'main_themes', 'closing']) THEN
    RAISE EXCEPTION 'Invalid segment key(s). Must be intro, main_themes, or closing.';
  END IF;

  -- Validate non-empty segments array
  IF array_length(p_segments, 1) IS NULL OR array_length(p_segments, 1) = 0 THEN
    RAISE EXCEPTION 'Must specify at least one segment to regenerate.';
  END IF;

  INSERT INTO regeneration_requests (episode_id, episode_date, segments, feedback)
  VALUES (p_episode_id, p_episode_date, p_segments, p_feedback)
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

> **Security notes on SECURITY DEFINER:**
> - These functions run with the creator's permissions, bypassing RLS.
> - Acceptable for single-user app. Document for future reference.
> - If this ever becomes multi-user, switch to SECURITY INVOKER with appropriate RLS policies.

---

## 6. Supabase Auth

- **Method:** Email/password (one account for Justin)
- **Setup:** Justin creates the user manually in Supabase Dashboard → Authentication → Users → Add User. Do NOT create via Cursor (avoids password in code context).
- **Frontend:** `supabase.auth.signInWithPassword({ email, password })`
- **Anon key** embedded in frontend — safe because RLS is enforced on all tables.
- **No sign-up flow** in the dashboard.

---

## 7. Dashboard Screens (Lovable Builds)

### Connection Setup
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://<project-ref>.supabase.co',  // Provided after Phase 1
  '<anon-key>'                           // Provided after Phase 1
)
```

### 7a. Login Screen
- Email + password form
- `supabase.auth.signInWithPassword({ email, password })`
- Redirect to Episode List on success
- No sign-up link, no password reset

### 7b. Episode List Screen

**Data source:** `dashboard_episode_list` view, filtered to last 28 days by default.

```javascript
const { data } = await supabase
  .from('dashboard_episode_list')
  .select('*')
  .gte('episode_date', twentyEightDaysAgo)
```

Plus a date picker for searching outside the default window.

**Layout — each row shows:**
- Episode date
- Human approval status badge
- Gate decision badge
- Intro preview text (truncated)
- Audio readiness (e.g. "3/3 ready" or "2/3 — 1 generating")
- Regeneration pending indicator
- Click row → navigate to Episode Detail

**Status badge colors:**

| Field | Value | Badge |
|---|---|---|
| Human approval | `pending` | Gray |
| Human approval | `approved` | Green |
| Human approval | `rejected` | Red |
| Gate decision | `ship` | Green ✓ |
| Gate decision | `fail` | Red ✕ |
| Audio | All 3 `ready` | Green "Audio ready" |
| Audio | Any `pending`/`generating` | Yellow spinner |
| Audio | Any `failed` | Red warning |
| Regen | `has_pending_regen = true` | Orange 🔄 |

**Filters:** Status dropdown (all / pending / approved / rejected)
**Sort:** Most recent date first (default from view)

### 7c. Episode Detail Screen

**Data source:** `dashboard_episode_detail` view, single row by `episode_id`.

```javascript
const { data } = await supabase
  .from('dashboard_episode_detail')
  .select('*')
  .eq('episode_id', episodeId)
  .single()
```

**Layout:** Tabbed interface with persistent action bar.

#### Tab 1: Script Review (default tab)

**Episode header:**
- Date, human approval status, gate decision (`ship`/`fail`), total audio duration (sum of segment durations)

**Full episode audio player** (if all segments have `audio_status = 'ready'`):
```javascript
const episodePath = `cloudia/episodes/${episodeDate}/episode.mp3`
const { data } = await supabase.storage
  .from('audio-private')
  .createSignedUrl(episodePath, 3600)
```
- HTML5 `<audio>` with play/pause, scrub bar, duration display
- "Download Episode MP3" button

**For each segment** (intro, main_themes, closing), displayed in order:
- **Header:** Segment label + version (e.g. "Main Themes — v3")
- **Script text** in a readable panel (full text, scrollable if long)
- **Gate info** from `segment_gate_details`:
  - Decision badge: `approve` (green) / `block` (red) / `rewrite` (orange)
  - Warnings list (if any)
  - Blocking reasons (if any)
  - Rewrite instructions (if present)
- **Audio player** (if `audio_status = 'ready'`):
  ```javascript
  const { data } = await supabase.storage
    .from('audio-private')
    .createSignedUrl(segment.audio_storage_path, 3600)
  ```
  - Play/pause, duration
  - "Download Segment Audio" button
- **Audio status** (if not ready):
  - `pending` / `generating` → yellow "Audio processing..." with spinner
  - `failed` → red with error message from `audio_last_error`
  - `NULL` → gray "No audio requested"

#### Tab 2: Newsletter (placeholder for v1)
- "Coming soon" message
- "Newsletter formatting will appear here once the template is configured."

#### Tab 3: Social (placeholder for v1)
- "Coming soon" message
- "Social graphics and captions will appear here once the design pipeline is connected."

#### Tab 4: History
- **Version history** from `version_history` JSON array:
  - Table with columns: segment, attempt #, gate decision, blocking reasons, timestamp
  - Expandable rows to show full `script_text` of previous versions
  - Sorted by segment then attempt number
- **Regeneration requests** from `regeneration_history` JSON array:
  - Each entry: timestamp, segments requested, feedback text, status, result notes
  - Most recent first

#### Persistent Action Bar (visible on all tabs)

Three buttons, always visible at top or bottom of detail screen:

**✅ Approve**
- Optional notes text field (expandable on click)
- Calls: `supabase.rpc('approve_episode', { p_episode_id, p_episode_date, p_notes })`
- On success: refresh view, show green confirmation toast

**❌ Reject**
- Optional notes text field
- Calls: `supabase.rpc('reject_episode', { p_episode_id, p_episode_date, p_notes })`
- On success: refresh view, show confirmation toast

**🔄 Regenerate** → opens modal:
- Checkboxes: intro / main_themes / closing (which segments to redo)
- Text area: editorial feedback/direction (max 1000 chars, enforced client-side)
- Placeholder hint: *"e.g. The closing feels too generic — reference the Pisces moon specifically"*
- Submit → calls: `supabase.rpc('request_regeneration', { p_episode_id, p_episode_date, p_segments, p_feedback })`
- On success: close modal, show "Regeneration requested" toast

### 7d. Polling

- Episode Detail: poll `dashboard_episode_detail` every 30 seconds
- Episode List: poll `dashboard_episode_list` every 60 seconds
- If a regeneration request moves from `pending` → `complete`, show notification toast and auto-refresh

---

## 8. Storage Access Pattern

Both segment and episode audio live in the `audio-private` bucket. The dashboard uses signed URLs with 1-hour expiry.

```javascript
// Per-segment audio (path from view data)
const { data } = await supabase.storage
  .from('audio-private')
  .createSignedUrl(segment.audio_storage_path, 3600)

// Stitched episode audio (deterministic path)
const episodePath = `cloudia/episodes/${episodeDate}/episode.mp3`
const { data } = await supabase.storage
  .from('audio-private')
  .createSignedUrl(episodePath, 3600)
```

**Download pattern:** Same signed URL, opened in new tab or triggered as download via the `download` query param that Supabase Storage supports.

---

## 9. Regeneration Flow (End-to-End)

```
Dashboard                     Supabase                      Pipeline (runEpisodeBatch.ts)
   │                             │                               │
   │── request_regeneration() ─▶│                               │
   │                             │── INSERT regeneration_        │
   │                             │   requests (status=pending)   │
   │                             │                               │
   │  (polls every 30s)          │                               │
   │                             │◀── SELECT pending requests ──│ (pipeline polls or is triggered)
   │                             │                               │
   │                             │── return request ───────────▶│
   │                             │                               │
   │                             │   Pipeline:                   │
   │                             │   1. Read feedback text        │
   │                             │   2. Sanitize (strip prompt   │
   │                             │      injection patterns,      │
   │                             │      enforce 1000 char limit)  │
   │                             │   3. Inject as editorial       │
   │                             │      directive in LLM prompt   │
   │                             │   4. Generate new script       │
   │                             │      (single-pass)             │
   │                             │   5. Run editorial gate        │
   │                             │   6. Persist to                │
   │                             │      cloudia_segment_versions  │
   │                             │   7. Upsert to                 │
   │                             │      cloudia_segments          │
   │                             │   8. Mark ready for audio      │
   │                             │      (if gate approves)        │
   │                             │                               │
   │                             │◀── UPDATE regen request ─────│
   │                             │    status = complete/failed    │
   │                             │                               │
   │◀── poll detects change ────│                               │
   │    auto-refresh UI          │                               │
```

**Phase 3 work (Cursor, after dashboard is usable):** Modify pipeline to poll `regeneration_requests` for pending items and process them. This does not block Phase 1 or Phase 2.

---

## 10. Security Checklist

| # | Risk | Mitigation | Owner | Status |
|---|---|---|---|---|
| 1 | Anon key in frontend | RLS on all dashboard-facing tables | Cursor | ⬜ Build |
| 2 | Unauthorized approvals/regens | Supabase Auth required; RLS enforces authenticated role | Cursor | ⬜ Build |
| 3 | Public audio access | Private bucket; signed URLs with 1hr expiry | Cursor | ⬜ Verify |
| 4 | TTS voice/model ID exposure | Views exclude `tts_voice_id` and `tts_model_id` columns | Cursor | ⬜ Verify |
| 5 | Feedback prompt injection | 1000 char DB limit; pipeline sanitizes before LLM injection | Cursor | ⬜ Build (Phase 3) |
| 6 | RLS breaks pipeline | Pipeline uses service role key (bypasses RLS) — verify `.env` | Cursor | ⬜ **Verify before enabling RLS** |
| 7 | SECURITY DEFINER escalation | Acceptable single-user; revisit if multi-user | — | ✅ Documented |
| 8 | Password in code context | Justin creates auth user manually via Supabase dashboard | Justin | ⬜ Do manually |
| 9 | Storage bucket policies | `audio-private` is already private; verify no public override | Cursor | ⬜ Verify |

---

## 11. Build Sequence

### Phase 1: Cursor — Schema & Backend
1. **VERIFY FIRST:** Confirm `.env` has `SUPABASE_SERVICE_ROLE_KEY` set (not just anon key)
2. Create `dashboard_approvals` table with indexes
3. Create `regeneration_requests` table with indexes
4. Enable RLS + add policies on both new tables
5. Enable RLS + add read-only policies on existing tables (`cloudia_segments`, `cloudia_segment_versions`, `editorial_gate_results`, `editorial_episode_gate_results`, `editorial_gate_overrides`, `batch_runs`)
6. Create `dashboard_episode_list` view
7. Create `dashboard_episode_detail` view
8. Create RPCs: `approve_episode`, `reject_episode`, `request_regeneration`
9. Verify storage bucket `audio-private` is private (no public override)
10. **Test all views and RPCs in Supabase SQL editor**
11. Commit after each logical unit: tables → RLS → views → RPCs
12. Provide to Justin: Supabase project URL and anon key for Lovable

### Phase 2: Lovable — Frontend (after Phase 1 complete)
1. Initialize project, install `@supabase/supabase-js`
2. Configure Supabase client with project URL + anon key from Phase 1
3. Build Login screen (Section 7a)
4. Build Episode List screen (Section 7b)
5. Build Episode Detail screen with all 4 tabs (Section 7c)
6. Wire Approve/Reject buttons to RPCs (Section 7c action bar)
7. Build Regenerate modal + wire to RPC (Section 7c action bar)
8. Build audio players with signed URL fetching (Section 8)
9. Add placeholder tabs for Newsletter and Social
10. Build History tab
11. Add polling (Section 7d)

### Phase 3: Cursor — Pipeline Regeneration Integration (after dashboard is stable)
1. Add regeneration request polling to batch runner or create dedicated regen worker
2. Implement feedback sanitization before LLM prompt injection
3. Wire status updates to `regeneration_requests` on completion
4. Test full roundtrip: request in dashboard → pipeline processes → result appears in dashboard

---

## 12. Resolved Questions

All questions resolved via Cursor codebase review (2026-02-10):

1. **Pipeline auth:** Uses `SUPABASE_SERVICE_ROLE_KEY` (preferred), falls back to anon key. Audio worker explicitly requires service key. **RLS on existing tables is safe as long as `.env` has the service key set.**
2. **Stitched episode audio:** `audio-private` bucket at `cloudia/episodes/{YYYY-MM-DD}/episode.mp3`.
3. **Episode ID:** `deterministicEpisodeId(program_slug, episode_date)` → SHA-256 of `"${program_slug}:${episode_date}"`, first 32 hex chars formatted as UUID.
4. **Gate decision values:**
   - `cloudia_segments.gate_decision`: always `"approve"` (only approved segments in this table)
   - `cloudia_segment_versions.gate_decision`: `"approve"` / `"block"` / `"rewrite"`
   - `editorial_gate_results.decision`: `"approve"` / `"block"` / `"rewrite"`
   - `editorial_episode_gate_results.decision`: `"ship"` / `"fail"`
5. **Audio status:** `"pending"` / `"generating"` / `"ready"` / `"failed"` / `NULL` (unmarked). Type defined in `crew_cloudia/audio/worker/audioTypes.ts`.