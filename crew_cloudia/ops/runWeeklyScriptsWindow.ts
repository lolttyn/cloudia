#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "child_process";
import { isSundayAtHourPT, getPTTimeString, getTodayPT } from "./timeGuard.js";
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
  programSlug: string;
  startDate: string | null;
  windowDays: number;
  force: boolean;
} {
  const args = process.argv.slice(2);
  let programSlug = "cloudia";
  let startDate: string | null = null;
  let windowDays = 7;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--start-date" && i + 1 < args.length) {
      startDate = args[i + 1];
      i++;
    } else if (arg === "--window-days" && i + 1 < args.length) {
      windowDays = parseInt(args[i + 1], 10);
      if (isNaN(windowDays) || windowDays < 1) {
        throw new Error("--window-days must be a positive integer");
      }
      i++;
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("--")) {
      // Positional: program_slug
      programSlug = arg;
    }
  }

  // Default start_date to today in PT if not provided
  if (!startDate) {
    startDate = getTodayPT();
  }

  return { programSlug, startDate, windowDays, force };
}

async function main() {
  try {
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const { programSlug, startDate, windowDays, force } = parseArgs();
    const ptTime = getPTTimeString();

    console.log(`[weekly-scripts] Starting at ${ptTime}`);
    console.log(`[weekly-scripts] Args: program=${programSlug} start_date=${startDate} window_days=${windowDays} force=${force}`);

    // Guard: Only proceed if Sunday 7am PT (within 15 min window) OR --force
    if (!force) {
      const guardPassed = isSundayAtHourPT(7, 15);
      if (!guardPassed) {
        console.log(`[weekly-scripts] Guard prevented run (not Sunday 7am PT)`);
        process.exit(0);
      }
    } else {
      console.log(`[weekly-scripts] --force flag set, bypassing guard`);
    }

    // Optional: Fail stale runs before claiming
    try {
      const staleCount = await failStaleBatchRuns("weekly_scripts", 180);
      if (staleCount > 0) {
        console.log(`[weekly-scripts] Failed ${staleCount} stale batch run(s)`);
      }
    } catch (e: any) {
      console.warn(`[weekly-scripts] Failed to check stale runs: ${e?.message ?? String(e)}`);
    }

    // Claim batch run
    const railwayJobId =
      process.env.RAILWAY_JOB_ID || process.env.RAILWAY_RUN_ID || null;

    const claimParams: ClaimBatchRunParams = {
      programSlug,
      startDate,
      windowDays,
      kind: "weekly_scripts",
      triggeredBy: force ? "manual" : "railway_cron",
      railwayJobId,
    };

    console.log(`[weekly-scripts] Claiming batch run...`);
    const claimResult = await claimBatchRun(claimParams);

    if (!claimResult.claimed) {
      console.log(`[weekly-scripts] Not claimed (another run may be in progress or already completed)`);
      process.exit(0);
    }

    const runId = claimResult.runId!;
    console.log(`[weekly-scripts] Claimed run ${runId}`);

    // Spawn the actual batch runner
    const command = "npx";
    const commandArgs = [
      "tsx",
      "crew_cloudia/runner/runEpisodeBatch.ts",
      programSlug,
      startDate!,
      "--window-days",
      String(windowDays),
      "--scripts-only",
      "--continue-on-error",
      "--retry-gate-failed",
    ];

    console.log(`[weekly-scripts] Executing: ${command} ${commandArgs.join(" ")}`);

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let jsonSummary: Record<string, unknown> | null = null;

    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
      
      // Try to extract JSON summary from stdout (look for unique marker pattern)
      // Marker format: CLOUDIA_BATCH_SUMMARY_{batchId}{JSON}
      const jsonMatch = stdout.match(/CLOUDIA_BATCH_SUMMARY_[a-f0-9-]{36}(\{.*\})/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          jsonSummary = JSON.parse(jsonMatch[1]);
        } catch (e) {
          // Ignore parse errors, will use full stdout
          console.warn(`[weekly-scripts] Failed to parse JSON summary: ${e}`);
        }
      }
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
        console.error(`[weekly-scripts] Spawn error:`, err);
        resolve(1);
      });
    });

    const durationMs = Date.now() - startTime;

    // Build output JSON with summary if available
    const baseOutputJson = {
      program_slug: programSlug,
      start_date: startDate,
      window_days: windowDays,
      command: `${command} ${commandArgs.join(" ")}`,
      duration_ms: durationMs,
    };

    if (exitCode === 0) {
      // Success
      const outputJson = {
        ...baseOutputJson,
        completed_at: new Date().toISOString(),
        ...(jsonSummary ? { summary: jsonSummary } : {}),
      };

      await completeBatchRun(runId, outputJson, `Completed successfully in ${durationMs}ms`);
      console.log(`[weekly-scripts] Completed run ${runId}`);
      process.exit(0);
    } else {
      // Failure (but may have partial results if continue-on-error was used)
      const errorMessage = `Command exited with code ${exitCode}`;
      const outputJson = {
        ...baseOutputJson,
        exit_code: exitCode,
        stdout: stdout.slice(-5000), // Last 5KB
        stderr: stderr.slice(-5000), // Last 5KB
        failed_at: new Date().toISOString(),
        ...(jsonSummary ? { summary: jsonSummary } : {}),
      };

      await failBatchRun(runId, errorMessage, outputJson, `Failed after ${durationMs}ms`);
      console.error(`[weekly-scripts] Failed run ${runId}: ${errorMessage}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`[weekly-scripts] Fatal error:`, err);
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
