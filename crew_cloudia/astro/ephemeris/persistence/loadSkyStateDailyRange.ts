import { supabase } from "../../../lib/supabaseClient";
import { SkyState, SkyStateSchema } from "../../../../astro/schemas/skyState.schema.js";

/**
 * Load sky_state records for a date range
 * @returns A date-keyed map that includes null for missing dates
 */
export async function loadSkyStateDailyRange(
  startDate: string,
  endDate: string
): Promise<Record<string, SkyState | null>> {
  const { data, error } = await supabase
    .from("sky_state_daily")
    .select("episode_date, sky_state")
    .gte("episode_date", startDate)
    .lte("episode_date", endDate)
    .order("episode_date", { ascending: true });

  if (error) {
    throw error;
  }

  // Build a map of found records
  const foundMap: Record<string, SkyState> = {};
  if (data) {
    for (const row of data) {
      if (row.sky_state) {
        try {
          foundMap[row.episode_date] = SkyStateSchema.parse(row.sky_state);
        } catch (parseError) {
          // If parsing fails, skip this row but log it
          console.warn(
            `Failed to parse sky_state for ${row.episode_date}:`,
            parseError
          );
        }
      }
    }
  }

  // Generate all dates in range and include null for missing ones
  const result: Record<string, SkyState | null> = {};
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

