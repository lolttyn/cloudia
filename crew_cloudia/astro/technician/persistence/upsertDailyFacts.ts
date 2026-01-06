import { supabase } from "../../../lib/supabaseClient.js";
import type { DailyFacts } from "../schema/dailyFacts.schema.js";

/**
 * Upsert daily facts into public.astrology_daily_facts table
 */
export async function upsertDailyFacts(facts: DailyFacts): Promise<void> {
  const { error } = await supabase
    .from("astrology_daily_facts")
    .upsert(
      {
        episode_date: facts.date,
        technician_policy_version: facts.technician_policy_version,
        technician_schema_version: facts.schema_version,
        sky_state_schema_version: facts.source.sky_state_schema_version,
        engine: facts.source.engine,
        engine_version: facts.source.engine_version,
        ephemeris_fileset: facts.source.ephemeris_fileset,
        facts: facts, // Full facts object as JSONB
        generated_at: facts.timestamp_generated,
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

