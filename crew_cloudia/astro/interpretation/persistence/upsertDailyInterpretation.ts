import { supabase } from "../../../lib/supabaseClient.js";
import { DailyInterpretation, DailyInterpretationSchema } from "../schema/dailyInterpretation.schema.js";

/**
 * Upsert daily interpretation into public.cloudia_daily_interpretation table
 */
export async function upsertDailyInterpretation(args: {
  episode_date: string; // YYYY-MM-DD
  dailyInterpretation: DailyInterpretation;
}): Promise<void> {
  // Validate with DailyInterpretationSchema
  const validated = DailyInterpretationSchema.parse(args.dailyInterpretation);

  const { error } = await supabase
    .from("cloudia_daily_interpretation")
    .upsert(
      {
        episode_date: args.episode_date,
        daily_interpretation: validated, // Full object as JSONB
        schema_version: 1, // Default schema version
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

