import { supabase } from "../../../lib/supabaseClient.js";
import type { DailyFacts } from "../schema/dailyFacts.schema.js";

/**
 * Insert daily facts into public.astrology_daily_facts table
 * 
 * IMPORTANT: This function will NOT overwrite existing rows.
 * It will only insert if the date is missing.
 * If the date already exists, it will throw an error.
 * 
 * This ensures reproducibility: once facts are persisted for a date,
 * they cannot be accidentally overwritten.
 */
export async function upsertDailyFacts(facts: DailyFacts): Promise<void> {
  // Check if row already exists
  const { data: existing, error: checkError } = await supabase
    .from("astrology_daily_facts")
    .select("episode_date")
    .eq("episode_date", facts.date)
    .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  if (existing) {
    throw new Error(
      `Cannot overwrite existing daily_facts for ${facts.date}. Refusing to overwrite for reproducibility.`
    );
  }

  // Insert new row
  const { error } = await supabase
    .from("astrology_daily_facts")
    .insert({
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
    });

  if (error) {
    throw error;
  }
}

