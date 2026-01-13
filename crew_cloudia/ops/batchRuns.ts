import "dotenv/config";
import { supabase } from "../lib/supabaseClient";

export type BatchRunKind = "weekly_scripts" | "daily_stitch";

export type ClaimBatchRunParams = {
  programSlug: string;
  startDate: string; // YYYY-MM-DD
  windowDays: number;
  kind: BatchRunKind;
  triggeredBy: "railway_cron" | "manual";
  railwayJobId?: string | null;
};

export type BatchRunClaimResult = {
  claimed: boolean;
  runId?: string;
  run?: {
    id: string;
    program_slug: string;
    start_date: string;
    window_days: number;
    kind: BatchRunKind;
    status: string;
    claimed_at: string;
  };
};

/**
 * Claim a batch run. Returns null if not claimed (another run is in progress or already completed).
 */
export async function claimBatchRun(
  params: ClaimBatchRunParams
): Promise<BatchRunClaimResult> {
  const { data, error } = await supabase.rpc("claim_batch_run", {
    p_program_slug: params.programSlug,
    p_start_date: params.startDate,
    p_window_days: params.windowDays,
    p_kind: params.kind,
    p_triggered_by: params.triggeredBy,
    p_railway_job_id: params.railwayJobId ?? null,
  });

  if (error) {
    throw new Error(`Failed to claim batch run: ${error.message}`);
  }

  // Supabase RPC may return null when not claimed (no error, just no row)
  if (!data || (Array.isArray(data) && data.length === 0) || data === null) {
    return { claimed: false };
  }

  // Handle both single row and array response
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || !row.id) {
    return { claimed: false };
  }

  return {
    claimed: true,
    runId: row.id,
    run: {
      id: row.id,
      program_slug: row.program_slug,
      start_date: row.start_date,
      window_days: row.window_days,
      kind: row.kind,
      status: row.status,
      claimed_at: row.claimed_at,
    },
  };
}

/**
 * Mark a batch run as completed.
 */
export async function completeBatchRun(
  runId: string,
  outputJson?: Record<string, unknown>,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc("complete_batch_run", {
    p_run_id: runId,
    p_output_json: outputJson ?? null,
    p_notes: notes ?? null,
  });

  if (error) {
    throw new Error(`Failed to complete batch run: ${error.message}`);
  }
}

/**
 * Mark a batch run as failed.
 */
export async function failBatchRun(
  runId: string,
  errorMessage: string,
  outputJson?: Record<string, unknown>,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc("fail_batch_run", {
    p_run_id: runId,
    p_error_message: errorMessage,
    p_output_json: outputJson ?? null,
    p_notes: notes ?? null,
  });

  if (error) {
    throw new Error(`Failed to fail batch run: ${error.message}`);
  }
}

/**
 * Fail stale batch runs that have been running too long.
 * 
 * @param kind - Batch run kind to check
 * @param ttlMinutes - Time-to-live in minutes (runs older than this are considered stale)
 */
export async function failStaleBatchRuns(
  kind: BatchRunKind,
  ttlMinutes: number
): Promise<number> {
  const { data, error } = await supabase.rpc("fail_stale_batch_runs", {
    p_kind: kind,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) {
    // If RPC doesn't exist, log warning but don't fail
    console.warn(`[batch-runs] fail_stale_batch_runs RPC not available: ${error.message}`);
    return 0;
  }

  // RPC returns count of failed runs
  return typeof data === "number" ? data : 0;
}
