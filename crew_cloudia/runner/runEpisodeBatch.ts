import "dotenv/config";

import crypto, { randomUUID } from "crypto";

import { runIntroForDate } from "../../run-intro.js";
import { runMainThemesForDate } from "../../run-main-themes.js";
import { runClosingForDate } from "../../run-closing.js";
import { evaluateEpisodeGate } from "../editorial/gate/evaluateEpisodeGate.js";
import { persistEpisodeGateResult } from "../editorial/gate/persistEpisodeGateResult.js";
import { runInterpreter } from "../interpretation/runInterpreter.js";
import { runInterpreterCanonical } from "../astro/interpretation/runInterpreterCanonical.js";
import { assertEpisodeIsPublishable } from "../editorial/gates/assertEpisodeIsPublishable.js";
import { RunSummaryCollector } from "./phaseG/runSummaryCollector.js";
import { loadSkyStateDailyRange } from "../astro/ephemeris/persistence/loadSkyStateDailyRange.js";
import { seedSkyStateRange } from "../tools/ephemeris/seedSkyStateRange.js";
import { loadDailyFactsRange } from "../astro/technician/persistence/loadDailyFactsRange.js";
import { seedDailyFactsRange } from "../tools/technician/seedDailyFactsRange.js";

type ParsedArgs = {
  program_slug: string;
  start_date: string;
  window_days: number;
  scripts_only: boolean;
  no_preseed: boolean;
  preseed_only: boolean;
  continue_on_error: boolean;
  retry_gate_failed: boolean;
};

export type DateRunResult = {
  episode_date: string;
  success: boolean;
  error?: string;
  error_type?: "episode_gate_failed" | "segment_generation_failed" | "mark_audio_failed" | "other";
};

const batchId = randomUUID();

/**
 * Custom error for preflight failures (no stack trace in CLI output)
 */
class PreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreflightError";
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const [, , program_slug, start_date, ...rest] = argv;
  if (!program_slug || !start_date) {
    throw new Error(
      "Usage: tsx crew_cloudia/runner/runEpisodeBatch.ts <program_slug> <start_date YYYY-MM-DD> [--window-days N] [--scripts-only] [--no-preseed] [--preseed-only] [--continue-on-error] [--retry-gate-failed]"
    );
  }

  let window_days = 1;
  let scripts_only = false;
  let no_preseed = false;
  let preseed_only = false;
  let continue_on_error = false;
  let retry_gate_failed = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--window-days") {
      const val = rest[i + 1];
      if (!val || Number.isNaN(Number(val))) {
        throw new Error("--window-days must be a number");
      }
      window_days = Number(val);
      i += 1;
    } else if (token === "--scripts-only") {
      scripts_only = true;
    } else if (token === "--no-preseed") {
      no_preseed = true;
    } else if (token === "--preseed-only") {
      preseed_only = true;
    } else if (token === "--continue-on-error") {
      continue_on_error = true;
    } else if (token === "--retry-gate-failed") {
      retry_gate_failed = true;
    } else {
      // ignore unknown flags silently to keep behavior minimal
    }
  }

  if (window_days < 1) {
    throw new Error("--window-days must be >= 1");
  }

  return { program_slug, start_date, window_days, scripts_only, no_preseed, preseed_only, continue_on_error, retry_gate_failed };
}

function expandDates(start: string, windowDays: number): string[] {
  const base = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid start_date ${start}`);
  }

  const dates: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    const next = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = next.toISOString().slice(0, 10);
    dates.push(iso);
  }
  return dates;
}

/**
 * Compress missing dates into contiguous ranges
 * Example: [2026-01-01, 2026-01-02, 2026-01-05] -> [{start: '2026-01-01', end: '2026-01-02'}, {start: '2026-01-05', end: '2026-01-05'}]
 */
function toRanges(missingDates: string[]): Array<{ start: string; end: string }> {
  if (missingDates.length === 0) return [];
  const sorted = [...missingDates].sort(); // YYYY-MM-DD lex sort works
  const ranges: Array<{ start: string; end: string }> = [];
  let start = sorted[0];
  let prev = sorted[0];

  const addDays = (d: string, n: number) => {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const expectedNext = addDays(prev, 1);
    if (cur === expectedNext) {
      prev = cur;
      continue;
    }
    ranges.push({ start, end: prev });
    start = cur;
    prev = cur;
  }
  ranges.push({ start, end: prev });
  return ranges;
}

/**
 * Get missing sky_state_daily dates for a range
 */
async function getMissingSkyStateDates(startDate: string, endDate: string): Promise<string[]> {
  const map = await loadSkyStateDailyRange(startDate, endDate);
  if (!map || typeof map !== "object") {
    throw new Error(
      `[preseed:l0] loadSkyStateDailyRange returned invalid value: ${map}. Expected object.`
    );
  }
  return Object.entries(map)
    .filter(([, v]) => v == null)
    .map(([k]) => k)
    .sort();
}

/**
 * Get missing astrology_daily_facts dates for a range
 */
async function getMissingDailyFactsDates(startDate: string, endDate: string): Promise<string[]> {
  const map = await loadDailyFactsRange(startDate, endDate);
  if (!map || typeof map !== "object") {
    throw new Error(
      `[preseed:l1] loadDailyFactsRange returned invalid value: ${map}. Expected object.`
    );
  }
  return Object.entries(map)
    .filter(([, v]) => v == null)
    .map(([k]) => k)
    .sort();
}

/**
 * Format seed commands for error messages (Layer 0)
 */
function formatSeedCommands(ranges: Array<{ start: string; end: string }>): string {
  return ranges
    .map(
      (r) =>
        `npx tsx crew_cloudia/tools/ephemeris/seedSkyStateRange.ts ${r.start} ${r.end}`
    )
    .join("\n");
}

/**
 * Format seed commands for error messages (Layer 1)
 */
function formatDailyFactsSeedCommands(ranges: Array<{ start: string; end: string }>): string {
  return ranges
    .map(
      (r) =>
        `npx tsx crew_cloudia/tools/technician/seedDailyFactsRange.ts ${r.start} ${r.end}`
    )
    .join("\n");
}

/**
 * Ensure Layer 0 (sky_state_daily) and Layer 1 (astrology_daily_facts) coverage for the requested range
 * - If missing and noPreseed=false: auto-seed missing ranges
 * - If missing and noPreseed=true: throw with exact seed commands
 * 
 * Exported for testing
 */
export async function ensurePrereqsForRange(opts: {
  startDate: string;
  endDate: string;
  noPreseed: boolean;
}): Promise<void> {
  const { startDate, endDate, noPreseed } = opts;

  // Layer 0: sky_state_daily
  console.log(`[preseed:l0] requested=${startDate}..${endDate}`);

  const missing = await getMissingSkyStateDates(startDate, endDate);
  if (missing.length === 0) {
    console.log(`[preseed:l0] coverage=ok missing=0`);
  } else {
    const ranges = toRanges(missing);
    console.log(`[preseed:l0] coverage=missing missing_count=${missing.length} ranges=${JSON.stringify(ranges)}`);

    if (noPreseed) {
      const msg =
        `Missing Layer 0 sky_state_daily for requested range ${startDate}..${endDate}.\n` +
        `Run:\n${formatSeedCommands(ranges)}\n` +
        `Then rerun your original command.`;
      throw new PreflightError(msg);
    }

    const t0 = Date.now();
    for (const r of ranges) {
      console.log(`[preseed:l0] seeding ${r.start}..${r.end}`);
      await seedSkyStateRange(r.start, r.end);
    }
    const dt = Date.now() - t0;

    const missingAfter = await getMissingSkyStateDates(startDate, endDate);
    if (missingAfter.length > 0) {
      const afterRanges = toRanges(missingAfter);
      const msg =
        `Layer 0 preseed attempted but coverage is still missing for ${startDate}..${endDate}.\n` +
        `Attempted seed ranges: ${JSON.stringify(ranges)}\n` +
        `Still missing: ${JSON.stringify(afterRanges)}\n` +
        `Try re-running:\n${formatSeedCommands(afterRanges)}`;
      throw new PreflightError(msg);
    }

    console.log(`[preseed:l0] coverage=ok missing=0 duration_ms=${dt}`);
  }

  // Layer 1: astrology_daily_facts (runs after L0 succeeds)
  console.log(`[preseed:l1] requested=${startDate}..${endDate}`);

  const missingFacts = await getMissingDailyFactsDates(startDate, endDate);
  if (missingFacts.length === 0) {
    console.log(`[preseed:l1] coverage=ok missing=0`);
  } else {
    const ranges = toRanges(missingFacts);
    console.log(`[preseed:l1] coverage=missing missing_count=${missingFacts.length} ranges=${JSON.stringify(ranges)}`);

    if (noPreseed) {
      const msg =
        `Missing Layer 1 astrology_daily_facts for requested range ${startDate}..${endDate}.\n` +
        `Run:\n${formatDailyFactsSeedCommands(ranges)}\n` +
        `Then rerun your original command.`;
      throw new PreflightError(msg);
    }

    const t1 = Date.now();
    for (const r of ranges) {
      console.log(`[preseed:l1] seeding ${r.start}..${r.end}`);
      await seedDailyFactsRange(r.start, r.end);
    }
    const dt = Date.now() - t1;

    const missingAfter = await getMissingDailyFactsDates(startDate, endDate);
    if (missingAfter.length > 0) {
      const afterRanges = toRanges(missingAfter);
      const msg =
        `Layer 1 preseed attempted but coverage is still missing for ${startDate}..${endDate}.\n` +
        `Attempted seed ranges: ${JSON.stringify(ranges)}\n` +
        `Still missing: ${JSON.stringify(afterRanges)}\n` +
        `Try re-running:\n${formatDailyFactsSeedCommands(afterRanges)}`;
      throw new PreflightError(msg);
    }

    console.log(`[preseed:l1] coverage=ok missing=0 duration_ms=${dt}`);
  }
}

function deterministicEpisodeId(program_slug: string, episode_date: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${program_slug}:${episode_date}`)
    .digest("hex");

  // Format first 32 hex chars into UUID shape to satisfy uuid column types
  const base = hash.slice(0, 32);
  return [
    base.slice(0, 8),
    base.slice(8, 12),
    base.slice(12, 16),
    base.slice(16, 20),
    base.slice(20, 32),
  ].join("-");
}

export async function runForDate(
  program_slug: string,
  episode_date: string,
  scripts_only: boolean,
  collector?: RunSummaryCollector,
  continue_on_error: boolean = false,
  retry_gate_failed: boolean = false
): Promise<DateRunResult> {
  const episode_id = deterministicEpisodeId(program_slug, episode_date);
  const today = new Date().toISOString().slice(0, 10);
  const time_context = episode_date === today ? "day_of" : "future";
  const batch_id = batchId;

  console.log(`[batch:date] ${episode_date}`);

  // Parse interpretation mode from environment (default to canonical for Phase G)
  const modeRaw = (process.env.CLOUDIA_INTERPRETATION_MODE ?? "canonical").toLowerCase();
  const interpretationMode = modeRaw === "canonical" ? "canonical" : "legacy";

  const interpretive_frame =
    interpretationMode === "canonical"
      ? await runInterpreterCanonical({ date: episode_date })
      : await runInterpreter({ date: episode_date });

  const introResult = await runIntroForDate({
    program_slug,
    episode_date,
    episode_id,
    batch_id,
    time_context,
    interpretive_frame,
    collector,
    scripts_only,
  });

  const mainThemesResult = await runMainThemesForDate({
    program_slug,
    episode_date,
    episode_id,
    batch_id,
    time_context,
    interpretive_frame,
    collector,
    retry_gate_failed,
    scripts_only,
  });

  const closingResult = await runClosingForDate({
    program_slug,
    episode_date,
    episode_id,
    batch_id,
    time_context,
    interpretive_frame,
    collector,
    scripts_only,
  });

  const segment_results = [
    {
      segment_key: introResult.segment_key,
      decision: introResult.gate_result.decision,
      blocking_reasons: introResult.gate_result.blocking_reasons,
    },
    {
      segment_key: mainThemesResult.segment_key,
      decision: mainThemesResult.gate_result.decision,
      blocking_reasons: mainThemesResult.gate_result.blocking_reasons,
    },
    {
      segment_key: closingResult.segment_key,
      decision: closingResult.gate_result.decision,
      blocking_reasons: closingResult.gate_result.blocking_reasons,
    },
  ];

  const episodeGate = evaluateEpisodeGate({
    episode_id,
    episode_date,
    time_context,
    segment_results,
    policy_version: "v0.1",
  });

  await persistEpisodeGateResult({
    episode_id,
    episode_date,
    gate_result: episodeGate,
  });

  // Record episode gate for Phase G instrumentation
  if (collector) {
    collector.recordEpisodeGate({
      episode_date,
      decision: episodeGate.decision,
      failed_segments: episodeGate.failed_segments,
    });
  }

  // Quality thresholds are uniform across all episode dates.
  // All episodes must meet the same quality standards regardless of date.
  if (episodeGate.decision === "fail") {
    const errorMsg = `Episode ${episode_date} failed editorial gate: ${episodeGate.failed_segments
      .map((s) => s.segment_key)
      .join(", ")}`;
    
    if (continue_on_error) {
      return {
        episode_date,
        success: false,
        error: errorMsg,
        error_type: "episode_gate_failed",
      };
    } else {
      throw new Error(errorMsg);
    }
  }

  // Publish-time enforcement: only run when we intend to publish / continue beyond scripts
  if (!scripts_only) {
    try {
      await assertEpisodeIsPublishable({
        episode_id,
        required_segments: ["intro", "main_themes", "closing"],
      });
    } catch (err: any) {
      if (continue_on_error) {
        return {
          episode_date,
          success: false,
          error: err?.message ?? String(err),
          error_type: "other",
        };
      } else {
        throw err;
      }
    }
  }

  return {
    episode_date,
    success: true,
  };
}

async function main() {
  const { program_slug, start_date, window_days, scripts_only, no_preseed, preseed_only, continue_on_error, retry_gate_failed } = parseArgs(process.argv);
  const dates = expandDates(start_date, window_days);

  // Parse interpretation mode from environment (default to canonical for Phase G)
  const modeRaw = (process.env.CLOUDIA_INTERPRETATION_MODE ?? "canonical").toLowerCase();
  const interpretationMode = modeRaw === "canonical" ? "canonical" : "legacy";

  const date_from = dates[0];
  const date_to = dates[dates.length - 1];

  // Layer 0 preflight gate: check coverage and auto-seed if needed
  await ensurePrereqsForRange({
    startDate: date_from,
    endDate: date_to,
    noPreseed: no_preseed,
  });

  // If --preseed-only, exit after preseed step
  if (preseed_only) {
    console.log(`[preseed] preseed-only complete; exiting`);
    return;
  }

  // Create Phase G collector
  const collector = new RunSummaryCollector({
    program_slug,
    batch_id: batchId,
    mode: {
      canonical: interpretationMode === "canonical",
      scripts_only,
    },
    date_from,
    date_to,
  });

  console.log(`[batch:start] ${batchId}`);
  if (continue_on_error) {
    console.log(`[batch] continue-on-error mode: will continue through all dates even if some fail`);
  }

  const dateResults: DateRunResult[] = [];

  for (const date of dates) {
    if (continue_on_error) {
      try {
        const result = await runForDate(program_slug, date, scripts_only, collector, continue_on_error, retry_gate_failed);
        dateResults.push(result);
        if (!result.success) {
          console.error(`[batch:date] ${date} FAILED: ${result.error}`);
        }
      } catch (err: any) {
        // Catch any unexpected errors (e.g., from markSegmentReadyForAudio)
        const errorMsg = err?.message ?? String(err);
        console.error(`[batch:date] ${date} FAILED (unexpected error): ${errorMsg}`);
        
        // Detect error type from message
        let errorType: DateRunResult["error_type"] = "other";
        if (errorMsg.includes("script has") && errorMsg.includes("words")) {
          errorType = "mark_audio_failed";
        } else if (errorMsg.includes("failed editorial gate") || errorMsg.includes("failed segments")) {
          errorType = "episode_gate_failed";
        } else if (errorMsg.includes("did not achieve editor approval")) {
          errorType = "segment_generation_failed";
        }
        
        dateResults.push({
          episode_date: date,
          success: false,
          error: errorMsg,
          error_type: errorType,
        });
      }
    } else {
      // Original behavior: throw on first failure
      const result = await runForDate(program_slug, date, scripts_only, collector, continue_on_error, retry_gate_failed);
      if (!result.success) {
        throw new Error(result.error);
      }
      dateResults.push(result);
    }
  }

  console.log(`[batch:complete] ${batchId}`);

  // Print console summary table
  collector.printConsoleTable();

  // Print per-date failure summary if continue-on-error was used
  if (continue_on_error) {
    const failed = dateResults.filter((r) => !r.success);
    const succeeded = dateResults.filter((r) => r.success);
    
    console.log(`\n=== Batch Run Summary ===`);
    console.log(`Total dates: ${dateResults.length}`);
    console.log(`Succeeded: ${succeeded.length}`);
    console.log(`Failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log(`\nFailed dates:`);
      for (const result of failed) {
        console.log(`  ${result.episode_date}: ${result.error_type ?? "unknown"} - ${result.error}`);
      }
    }
  }

  // Write artifact to disk
  const artifactPath = `./artifacts/phase-g/baseline/${program_slug}/${date_from}__${date_to}__${batchId}.json`;
  await collector.writeArtifact(artifactPath);

  // In continue-on-error mode, also write a machine-readable summary JSON to stdout
  if (continue_on_error) {
    const summary = {
      batch_id: batchId,
      program_slug,
      date_from,
      date_to,
      total_dates: dateResults.length,
      succeeded: dateResults.filter((r) => r.success).length,
      failed: dateResults.filter((r) => !r.success).length,
      date_results: dateResults,
    };
    // Use unique marker with batch_id to ensure uniqueness
    const marker = `CLOUDIA_BATCH_SUMMARY_${batchId}`;
    // Print single-line JSON for easier log parsing
    console.log(`${marker}${JSON.stringify(summary)}`);
    
    // Exit non-zero if any failures occurred
    if (dateResults.some((r) => !r.success)) {
      process.exit(1);
    }
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
      if (err?.name === "PreflightError") {
        console.error(err.message);
        process.exit(1);
      }
      console.error(err);
      process.exit(1);
    });
  }
}

