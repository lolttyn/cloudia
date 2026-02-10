# Dashboard Phase 1 migrations

Run each migration in order in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query). After each file, run the verification query listed at the top of the file before proceeding.

**Order:**
1. `20260210000001_dashboard_tables.sql` — new tables
2. `20260210000002_dashboard_rls.sql` — RLS on new + existing tables
3. `20260210000003_dashboard_views.sql` — views
4. `20260210000004_dashboard_rpcs.sql` — RPC functions
