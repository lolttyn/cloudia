import { supabase } from "../../../lib/supabaseClient";
import { SkyState, SkyStateSchema } from "../../../../astro/schemas/skyState.schema.js";

/**
 * Upsert sky_state into public.sky_state_daily table
 */
export async function upsertSkyStateDaily(skyState: SkyState): Promise<void> {
  // Validate with SkyStateSchema
  const validated = SkyStateSchema.parse(skyState);

  const { error } = await supabase
    .from("sky_state_daily")
    .upsert(
      {
        episode_date: validated.timestamp.date,
        schema_version: validated.schema_version,
        engine: validated.meta.engine,
        engine_version: validated.meta.engine_version,
        ephemeris_fileset: validated.meta.ephemeris_fileset,
        timestamp_generated: validated.meta.timestamp_generated,
        sky_state: validated, // Full object as JSONB
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "episode_date",
      }
    );

  if (error) {
    throw error;
  }
}

