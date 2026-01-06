import { supabase } from "../../../lib/supabaseClient.js";
import { DailyFacts, DailyFactsSchema } from "../schema/dailyFacts.schema.js";

/**
 * Load a single daily_facts by date
 * @returns Parsed DailyFacts or null if not found
 */
export async function loadDailyFacts(date: string): Promise<DailyFacts | null> {
  const { data, error } = await supabase
    .from("astrology_daily_facts")
    .select("facts")
    .eq("episode_date", date)
    .single();

  if (error) {
    // If no rows found, return null
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  if (!data || !data.facts) {
    return null;
  }

  // Parse and validate the returned JSON
  return DailyFactsSchema.parse(data.facts);
}

