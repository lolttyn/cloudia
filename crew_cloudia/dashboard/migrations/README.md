# Dashboard Phase 1 migrations

Apply each SQL file **in order** in Supabase Dashboard → SQL Editor (copy/paste or run file contents).

1. `001_new_tables.sql` — dashboard_approvals, regeneration_requests
2. `002_rls_new_tables.sql` — RLS on new tables
3. `003_rls_existing_tables.sql` — RLS on pipeline tables (ensure `.env` has SUPABASE_SERVICE_ROLE_KEY)
4. `004_views.sql` — dashboard_episode_list, dashboard_episode_detail
5. `005_rpcs.sql` — approve_episode, reject_episode, request_regeneration

**Note:** If `editorial_gate_overrides` does not exist, create it or remove it from 003. If `dashboard_episode_detail` fails with "column audio_last_error does not exist", the table may use `audio_error_message` — update the view to use that column name.

After all are applied, from repo root:

```bash
# Optional: set SUPABASE_ANON_KEY for Step 2 (unauthenticated) check
npx tsx crew_cloudia/dashboard/verify-phase1.ts
```
