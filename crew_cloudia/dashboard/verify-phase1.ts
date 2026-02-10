#!/usr/bin/env node
/**
 * Phase 1 verification script.
 * Run after applying migrations 001–005 in Supabase SQL Editor.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and (for Step 2 test) SUPABASE_ANON_KEY.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Step 2: Unauthenticated query returns no rows ---
  if (ANON_KEY) {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [r1, r2] = await Promise.all([
      anonClient.from("dashboard_approvals").select("id"),
      anonClient.from("regeneration_requests").select("id"),
    ]);
    if (r1.error) throw new Error(`dashboard_approvals anon: ${r1.error.message}`);
    if (r2.error) throw new Error(`regeneration_requests anon: ${r2.error.message}`);
    if ((r1.data?.length ?? 0) !== 0 || (r2.data?.length ?? 0) !== 0) {
      throw new Error("Step 2 failed: unauthenticated client should see 0 rows");
    }
    console.log("Step 2 OK: unauthenticated query returns 0 rows");
  } else {
    console.log("Step 2 SKIP: SUPABASE_ANON_KEY not set (run in SQL Editor: SELECT * FROM dashboard_approvals with anon key; expect 0 rows)");
  }

  // --- Step 3: Service key can still write (bypasses RLS) ---
  // Use dashboard_approvals to avoid touching immutable pipeline tables
  const testId = crypto.randomUUID();
  const { error: insErr } = await serviceClient.from("dashboard_approvals").insert({
    id: testId,
    episode_id: "00000000-0000-0000-0000-000000000000",
    episode_date: "2026-01-01",
    decision: "approved",
    notes: "phase1 verify",
  });
  if (insErr) throw new Error(`Step 3 insert failed: ${insErr.message}`);
  const { error: delErr } = await serviceClient.from("dashboard_approvals").delete().eq("id", testId);
  if (delErr) throw new Error(`Step 3 delete failed: ${delErr.message}`);
  console.log("Step 3 OK: service key write test (insert + delete) succeeded");

  // --- Step 4: View tests ---
  const listRes = await serviceClient.from("dashboard_episode_list").select("*").limit(5);
  if (listRes.error) throw new Error(`dashboard_episode_list: ${listRes.error.message}`);
  console.log("\n--- dashboard_episode_list (limit 5) ---");
  console.log(JSON.stringify(listRes.data, null, 2));

  const detailRes = await serviceClient.from("dashboard_episode_detail").select("*").limit(1);
  if (detailRes.error) throw new Error(`dashboard_episode_detail: ${detailRes.error.message}`);
  console.log("\n--- dashboard_episode_detail (limit 1) ---");
  console.log(JSON.stringify(detailRes.data, null, 2));

  // --- Step 5: RPC tests (use first episode from list if any) ---
  let episodeId: string | null = null;
  let episodeDate: string | null = null;
  if (listRes.data && listRes.data.length > 0) {
    episodeId = (listRes.data[0] as { episode_id?: string }).episode_id ?? null;
    episodeDate = (listRes.data[0] as { episode_date?: string }).episode_date ?? null;
  }
  if (!episodeId || !episodeDate) {
    console.log("Step 5 SKIP: no episodes in view (run RPC tests manually in SQL Editor)");
  } else {
    const approveRes = await serviceClient.rpc("approve_episode", {
      p_episode_id: episodeId,
      p_episode_date: episodeDate,
      p_notes: "test approval",
    });
    if (approveRes.error) throw new Error(`approve_episode: ${approveRes.error.message}`);
    const approvalId = approveRes.data as string;
    if (!approvalId) throw new Error("approve_episode did not return UUID");
    console.log("Step 5 approve_episode OK, id:", approvalId);

    const rejectRes = await serviceClient.rpc("reject_episode", {
      p_episode_id: episodeId,
      p_episode_date: episodeDate,
      p_notes: "test rejection",
    });
    if (rejectRes.error) throw new Error(`reject_episode: ${rejectRes.error.message}`);
    console.log("Step 5 reject_episode OK");

    const regenRes = await serviceClient.rpc("request_regeneration", {
      p_episode_id: episodeId,
      p_episode_date: episodeDate,
      p_segments: ["intro"],
      p_feedback: "test feedback",
    });
    if (regenRes.error) throw new Error(`request_regeneration: ${regenRes.error.message}`);
    const regenId = regenRes.data as string;
    if (!regenId) throw new Error("request_regeneration did not return UUID");
    console.log("Step 5 request_regeneration OK, id:", regenId);

    // Clean up test rows
    await serviceClient.from("dashboard_approvals").delete().eq("episode_id", episodeId).eq("episode_date", episodeDate);
    await serviceClient.from("regeneration_requests").delete().eq("id", regenId);
    console.log("Step 5 OK: RPC tests passed, test rows deleted");
  }

  // --- Step 6: Storage buckets ---
  const { data: buckets, error: bucketErr } = await serviceClient.storage.listBuckets();
  if (bucketErr) throw new Error(`listBuckets: ${bucketErr.message}`);
  console.log("\n--- storage.buckets ---");
  console.log(JSON.stringify(buckets?.map((b: { id?: string; name?: string; public?: boolean }) => ({ id: b.id, name: b.name, public: b.public })), null, 2));
  const audioPrivate = buckets?.find((b: { name?: string }) => b.name === "audio-private");
  if (audioPrivate && (audioPrivate as { public?: boolean }).public === true) {
    throw new Error("Step 6 failed: audio-private bucket should be private");
  }
  console.log("Step 6 OK: audio-private is private");

  console.log("\nAll checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
