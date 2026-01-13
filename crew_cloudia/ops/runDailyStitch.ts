#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "child_process";
import { isWeekdayAtHourPT, getPTTimeString, getTodayPT } from "./timeGuard.js";
import {
  claimBatchRun,
  completeBatchRun,
  failBatchRun,
  failStaleBatchRuns,
  type ClaimBatchRunParams,
} from "./batchRuns.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseArgs(): {
  force: boolean;
  scanLimit: number | null;
} {
  const args = process.argv.slice(2);
  let force = false;
  let scanLimit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force") {
      force = true;
    } else if (arg === "--scan-limit" && i + 1 < args.length) {
      scanLimit = parseInt(args[i + 1], 10);
      if (isNaN(scanLimit) || scanLimit < 1) {
        throw new Error("--scan-limit must be a positive integer");
      }
      i++;
    }
  }

  return { force, scanLimit };
}

async function main() {
  try {
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const { force, scanLimit } = parseArgs();
    const ptTime = getPTTimeString();

    console.log(`[daily-stitch] Starting at ${ptTime}`);
    console.log(`[daily-stitch] Args: force=${force} scan_limit=${scanLimit ?? "default"}`);

    // Guard: Only proceed if weekday ~8am PT (within 15 min window) OR --force
    if (!force) {
      const guardPassed = isWeekdayAtHourPT(8, 15);
      if (!guardPassed) {
        console.log(`[daily-stitch] Guard prevented run (not weekday 8am PT)`);
        process.exit(0);
      }
    } else {
      console.log(`[daily-stitch] --force flag set, bypassing guard`);
    }

    // Optional: Fail stale runs before claiming
    try {
      const staleCount = await failStaleBatchRuns("daily_stitch", 120);
      if (staleCount > 0) {
        console.log(`[daily-stitch] Failed ${staleCount} stale batch run(s)`);
      }
    } catch (e: any) {
      console.warn(`[daily-stitch] Failed to check stale runs: ${e?.message ?? String(e)}`);
    }

    // Claim batch run
    // For daily stitch, we use today's date and window_days=1 as the locking key
    const todayPT = getTodayPT();
    const railwayJobId =
      process.env.RAILWAY_JOB_ID || process.env.RAILWAY_RUN_ID || null;

    const claimParams: ClaimBatchRunParams = {
      programSlug: "cloudia", // Default for stitch runs
      startDate: todayPT,
      windowDays: 1,
      kind: "daily_stitch",
      triggeredBy: force ? "manual" : "railway_cron",
      railwayJobId,
    };

    console.log(`[daily-stitch] Claiming batch run for ${todayPT}...`);
    const claimResult = await claimBatchRun(claimParams);

    if (!claimResult.claimed) {
      console.log(`[daily-stitch] Not claimed (another run may be in progress or already completed)`);
      process.exit(0);
    }

    const runId = claimResult.runId!;
    console.log(`[daily-stitch] Claimed run ${runId}`);

    // Spawn the stitch worker
    const command = "npx";
    const commandArgs = ["tsx", "crew_cloudia/audio/worker/runStitchWorkerOnce.ts"];

    // Add scan-limit if provided (or use env var)
    if (scanLimit !== null) {
      commandArgs.push("--limit", String(scanLimit));
    } else if (process.env.CLOUDIA_STITCH_WORKER_SCAN_LIMIT) {
      commandArgs.push("--limit", process.env.CLOUDIA_STITCH_WORKER_SCAN_LIMIT);
    }

    console.log(`[daily-stitch] Executing: ${command} ${commandArgs.join(" ")}`);

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on("close", (code) => {
        resolve(code ?? 1);
      });
      child.on("error", (err) => {
        console.error(`[daily-stitch] Spawn error:`, err);
        resolve(1);
      });
    });

    const durationMs = Date.now() - startTime;

    if (exitCode === 0) {
      // Success
      const outputJson = {
        start_date: todayPT,
        command: `${command} ${commandArgs.join(" ")}`,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      };

      await completeBatchRun(runId, outputJson, `Completed successfully in ${durationMs}ms`);
      console.log(`[daily-stitch] Completed run ${runId}`);
      process.exit(0);
    } else {
      // Failure
      const errorMessage = `Command exited with code ${exitCode}`;
      const outputJson = {
        start_date: todayPT,
        command: `${command} ${commandArgs.join(" ")}`,
        duration_ms: durationMs,
        exit_code: exitCode,
        stdout: stdout.slice(-5000), // Last 5KB
        stderr: stderr.slice(-5000), // Last 5KB
        failed_at: new Date().toISOString(),
      };

      await failBatchRun(runId, errorMessage, outputJson, `Failed after ${durationMs}ms`);
      console.error(`[daily-stitch] Failed run ${runId}: ${errorMessage}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`[daily-stitch] Fatal error:`, err);
    process.exit(1);
  }
}

if (process.argv[1]) {
  const invokedPath = (() => {
    try {
      return new URL(`file://${process.argv[1]}`).href;
    } catch {
      return undefined;
    }
  })();
  if (invokedPath && invokedPath === import.meta.url) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
