import { supabase } from "../../../lib/supabaseClient.js";
import { DailyFactsSchema, type DailyFacts } from "../schema/dailyFacts.schema.js";

/**
 * Insert daily facts into public.astrology_daily_facts table
 * 
 * IMPORTANT: This function is idempotent:
 * - Inserts if the date is missing
 * - Does nothing if the date already exists (ignores duplicate)
 * - Throws if existing row has version/fileset mismatches
 * 
 * This ensures reproducibility while allowing safe re-seeding and preventing race conditions.
 */
export async function upsertDailyFacts(facts: DailyFacts): Promise<void> {
  // Attempt insert (idempotent: will fail if duplicate, then we validate)
  const { error: insertError } = await supabase
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

  // If insert succeeded (no conflict), we're done
  if (!insertError) {
    return;
  }

  // If error is not a duplicate key error, throw it
  // PostgREST/Supabase returns code "23505" for unique constraint violations
  // Some Supabase clients may return different codes, so check the message too
  const isDuplicateError =
    insertError.code === "23505" ||
    insertError.code === "PGRST116" ||
    insertError.message?.includes("duplicate key") ||
    insertError.message?.includes("unique constraint");

  if (!isDuplicateError) {
    throw insertError;
  }

  // Row already exists - validate version invariants
  const { data: existing, error: loadError } = await supabase
    .from("astrology_daily_facts")
    .select("facts, technician_policy_version, technician_schema_version, sky_state_schema_version, engine_version, ephemeris_fileset")
    .eq("episode_date", facts.date)
    .single();

  if (loadError) {
    throw new Error(
      `Failed to load existing daily_facts for ${facts.date} after duplicate insert: ${loadError.message}`
    );
  }

  if (!existing || !existing.facts) {
    throw new Error(
      `Existing row for ${facts.date} has no facts data`
    );
  }

  // Parse and validate existing facts
  const existingFacts = DailyFactsSchema.parse(existing.facts);

  // Validate schema version matches
  if (existingFacts.schema_version !== facts.schema_version) {
    throw new Error(
      `Schema version mismatch for ${facts.date}: existing="${existingFacts.schema_version}", requested="${facts.schema_version}". Refusing to overwrite.`
    );
  }

  // Validate technician policy version matches
  if (existingFacts.technician_policy_version !== facts.technician_policy_version) {
    throw new Error(
      `Technician policy version mismatch for ${facts.date}: existing="${existingFacts.technician_policy_version}", requested="${facts.technician_policy_version}". Refusing to overwrite.`
    );
  }

  // Validate sky_state schema version matches
  if (existingFacts.source.sky_state_schema_version !== facts.source.sky_state_schema_version) {
    throw new Error(
      `Sky state schema version mismatch for ${facts.date}: existing="${existingFacts.source.sky_state_schema_version}", requested="${facts.source.sky_state_schema_version}". Refusing to overwrite.`
    );
  }

  // Validate ephemeris fileset matches (critical for reproducibility)
  if (existingFacts.source.ephemeris_fileset !== facts.source.ephemeris_fileset) {
    throw new Error(
      `Ephemeris fileset mismatch for ${facts.date}: existing="${existingFacts.source.ephemeris_fileset}", requested="${facts.source.ephemeris_fileset}". Refusing to overwrite.`
    );
  }

  // Validate engine version matches
  if (existingFacts.source.engine_version !== facts.source.engine_version) {
    throw new Error(
      `Engine version mismatch for ${facts.date}: existing="${existingFacts.source.engine_version}", requested="${facts.source.engine_version}". Refusing to overwrite.`
    );
  }

  // All validations passed - existing row is compatible, do nothing
}

