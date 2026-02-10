/**
 * Prior scripts from earlier in the week — used for narrative arc continuity.
 * Key = episode_date (YYYY-MM-DD). Batch takes precedence over DB when both have a date.
 */
export type PriorScripts = Record<
  string,
  { intro?: string; main_themes?: string; closing?: string }
>;

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Load prior scripts from cloudia_segments for the given date range.
 * Used when a batch starts mid-week or when continuity with last week is desired.
 * Caller must provide episode_id for each date (e.g. deterministicEpisodeId(program_slug, date)).
 */
export async function loadPriorScriptsFromDb(opts: {
  program_slug: string;
  start_date: string;
  end_date: string;
  deterministicEpisodeId: (program_slug: string, episode_date: string) => string;
}): Promise<PriorScripts> {
  const { program_slug, start_date, end_date, deterministicEpisodeId } = opts;
  const dates: string[] = [];
  for (let d = new Date(`${start_date}T00:00:00Z`); ; ) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > end_date) break;
    dates.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  if (dates.length === 0) return {};

  const { supabase } = await import("../lib/supabaseClient.js");
  const episodeIds = dates.map((date) => deterministicEpisodeId(program_slug, date));

  const { data: rows, error } = await supabase
    .from("cloudia_segments")
    .select("episode_id, episode_date, segment_key, script_text")
    .in("episode_id", episodeIds);

  if (error) {
    throw new Error(`Failed to load prior scripts: ${error.message}`);
  }

  const byDate: PriorScripts = {};
  for (const row of rows ?? []) {
    const date = row.episode_date as string;
    const key = row.segment_key as string;
    const text = (row.script_text as string) ?? "";
    if (!byDate[date]) byDate[date] = {};
    if (key === "intro" || key === "main_themes" || key === "closing") {
      byDate[date][key] = text;
    }
  }
  return byDate;
}

/**
 * Build the date range for "prior week" relative to the first date of the batch.
 * Returns [first_date - 6, first_date - 1] as start and end (inclusive).
 */
export function priorWeekRange(firstBatchDate: string): {
  start_date: string;
  end_date: string;
} | null {
  const end = addDays(firstBatchDate, -1);
  const start = addDays(firstBatchDate, -6);
  if (start > end) return null;
  return { start_date: start, end_date: end };
}
