import { supabase } from "../../../lib/supabaseClient.js";
import { DailyFacts, DailyFactsSchema } from "../schema/dailyFacts.schema.js";

/**
 * Load daily_facts records for a date range
 * @returns A date-keyed map that includes null for missing dates
 */
export async function loadDailyFactsRange(
  startDate: string,
  endDate: string
): Promise<Record<string, DailyFacts | null>> {
  const { data, error } = await supabase
    .from("astrology_daily_facts")
    .select("episode_date, facts")
    .gte("episode_date", startDate)
    .lte("episode_date", endDate)
    .order("episode_date", { ascending: true });

  if (error) {
    throw error;
  }

  // Build a map of found records
  const foundMap: Record<string, DailyFacts> = {};
  if (data) {
    for (const row of data) {
      if (row.facts) {
        try {
          foundMap[row.episode_date] = DailyFactsSchema.parse(row.facts);
        } catch (parseError) {
          // If parsing fails, skip this row but log it
          console.warn(
            `Failed to parse daily_facts for ${row.episode_date}:`,
            parseError
          );
        }
      }
    }
  }

  // Generate all dates in range and include null for missing ones
  const result: Record<string, DailyFacts | null> = {};
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  for (
    let d = new Date(start);
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10);
    result[dateStr] = foundMap[dateStr] ?? null;
  }

  return result;
}

