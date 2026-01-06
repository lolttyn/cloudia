import { supabase } from "../../../lib/supabaseClient";
import { SkyState, SkyStateSchema } from "../../../../astro/schemas/skyState.schema.js";

/**
 * Load a single sky_state by date
 * @returns Parsed SkyState or null if not found
 */
export async function loadSkyStateDaily(date: string): Promise<SkyState | null> {
  const { data, error } = await supabase
    .from("sky_state_daily")
    .select("sky_state")
    .eq("episode_date", date)
    .single();

  if (error) {
    // If no rows found, return null
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  if (!data || !data.sky_state) {
    return null;
  }

  // Parse and validate the returned JSON
  return SkyStateSchema.parse(data.sky_state);
}

