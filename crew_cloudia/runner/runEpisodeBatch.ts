import "dotenv/config";

import crypto, { randomUUID } from "crypto";

import { runIntroForDate } from "../../run-intro.js";
import { runMainThemesForDate } from "../../run-main-themes.js";
import { runClosingForDate } from "../../run-closing.js";
import { evaluateEpisodeGate } from "../editorial/gate/evaluateEpisodeGate.js";
import { persistEpisodeGateResult } from "../editorial/gate/persistEpisodeGateResult.js";
import { runInterpreter } from "../interpretation/runInterpreter.js";
import { runInterpreterCanonical } from "../astro/interpretation/runInterpreterCanonical.js";

type ParsedArgs = {
  program_slug: string;
  start_date: string;
  window_days: number;
  scripts_only: boolean;
};

const batchId = randomUUID();

function parseArgs(argv: string[]): ParsedArgs {
  const [, , program_slug, start_date, ...rest] = argv;
  if (!program_slug || !start_date) {
    throw new Error(
      "Usage: tsx crew_cloudia/runner/runEpisodeBatch.ts <program_slug> <start_date YYYY-MM-DD> [--window-days N] [--scripts-only]"
    );
  }

  let window_days = 1;
  let scripts_only = false;

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
    } else {
      // ignore unknown flags silently to keep behavior minimal
    }
  }

  if (window_days < 1) {
    throw new Error("--window-days must be >= 1");
  }

  return { program_slug, start_date, window_days, scripts_only };
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

export async function runForDate(program_slug: string, episode_date: string): Promise<void> {
  const episode_id = deterministicEpisodeId(program_slug, episode_date);
  const today = new Date().toISOString().slice(0, 10);
  const time_context = episode_date === today ? "day_of" : "future";
  const batch_id = batchId;

  console.log(`[batch:date] ${episode_date}`);

  // Parse interpretation mode from environment (default to legacy)
  const modeRaw = (process.env.CLOUDIA_INTERPRETATION_MODE ?? "legacy").toLowerCase();
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
  });

  const mainThemesResult = await runMainThemesForDate({
    program_slug,
    episode_date,
    episode_id,
    batch_id,
    time_context,
    interpretive_frame,
  });

  const closingResult = await runClosingForDate({
    program_slug,
    episode_date,
    episode_id,
    batch_id,
    time_context,
    interpretive_frame,
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

  // Quality thresholds are uniform across all episode dates.
  // All episodes must meet the same quality standards regardless of date.
  if (episodeGate.decision === "fail") {
    throw new Error(
      `Episode ${episode_date} failed editorial gate: ${episodeGate.failed_segments
        .map((s) => s.segment_key)
        .join(", ")}`
    );
  }
}

async function main() {
  const { program_slug, start_date, window_days } = parseArgs(process.argv);
  const dates = expandDates(start_date, window_days);

  console.log(`[batch:start] ${batchId}`);

  for (const date of dates) {
    await runForDate(program_slug, date);
  }

  console.log(`[batch:complete] ${batchId}`);
}

// Only run main() if this file is executed directly (not imported for testing)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("runEpisodeBatch.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

