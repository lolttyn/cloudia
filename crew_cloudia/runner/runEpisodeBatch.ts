import "dotenv/config";

import crypto from "crypto";

import { runIntroForDate } from "../../run-intro.js";
import { runMainThemesForDate } from "../../run-main-themes.js";

type ParsedArgs = {
  program_slug: string;
  start_date: string;
  window_days: number;
  scripts_only: boolean;
};

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
  return `episode-${hash.slice(0, 32)}`;
}

async function runForDate(program_slug: string, episode_date: string): Promise<void> {
  const episode_id = deterministicEpisodeId(program_slug, episode_date);

  await runIntroForDate({
    program_slug,
    episode_date,
    episode_id,
  });

  await runMainThemesForDate({
    program_slug,
    episode_date,
    episode_id,
  });
}

async function main() {
  const { program_slug, start_date, window_days } = parseArgs(process.argv);
  const dates = expandDates(start_date, window_days);

  for (const date of dates) {
    await runForDate(program_slug, date);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

