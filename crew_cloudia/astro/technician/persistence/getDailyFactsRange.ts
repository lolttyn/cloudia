import { getSkyStateRange } from "../../ephemeris/persistence/getSkyStateRange.js";
import { DailyFacts, DailyFactsSchema } from "../schema/dailyFacts.schema.js";
import { TECHNICIAN_POLICY_V1, type TechnicianPolicyV1 } from "../policy/technicianPolicy.v1.js";
import { loadDailyFactsRange } from "./loadDailyFactsRange.js";
import { upsertDailyFacts } from "./upsertDailyFacts.js";
import { deriveDailyFactsFromSkyState } from "../astrologyTechnician.js";

export type LoadMode = "read_only" | "compute_on_miss" | "require";

/**
 * Orchestrator for loading daily_facts with different modes
 */

// Overload for read_only mode (can return nulls)
export function getDailyFactsRange(
  startDate: string,
  endDate: string,
  mode: "read_only",
  policy?: TechnicianPolicyV1
): Promise<Record<string, DailyFacts | null>>;

// Overload for require/compute_on_miss modes (never null)
export function getDailyFactsRange(
  startDate: string,
  endDate: string,
  mode: "require" | "compute_on_miss",
  policy?: TechnicianPolicyV1
): Promise<Record<string, DailyFacts>>;

// Implementation
export async function getDailyFactsRange(
  startDate: string,
  endDate: string,
  mode: LoadMode,
  policy: TechnicianPolicyV1 = TECHNICIAN_POLICY_V1
): Promise<Record<string, DailyFacts | null> | Record<string, DailyFacts>> {
  // Always attempt DB load first
  const loaded = await loadDailyFactsRange(startDate, endDate);

  // For read_only, return as-is (with nulls)
  if (mode === "read_only") {
    return loaded;
  }

  // Check for missing dates and validate existing ones
  const missingDates: string[] = [];
  const expectedSchemaVersion = "1.0.0";
  const expectedPolicyVersion = policy.technician_policy_version;

  for (const [date, facts] of Object.entries(loaded)) {
    if (facts === null) {
      missingDates.push(date);
    } else {
      // Validate schema_version - throw if mismatch
      if (facts.schema_version !== expectedSchemaVersion) {
        throw new Error(
          `Schema version mismatch for ${date}: expected "${expectedSchemaVersion}", got "${facts.schema_version}". Refusing to overwrite.`
        );
      }

      // Validate technician_policy_version - throw if mismatch
      if (facts.technician_policy_version !== expectedPolicyVersion) {
        throw new Error(
          `Technician policy version mismatch for ${date}: expected "${expectedPolicyVersion}", got "${facts.technician_policy_version}". Refusing to overwrite.`
        );
      }
    }
  }

  // For require mode, throw if any missing
  if (mode === "require") {
    if (missingDates.length > 0) {
      throw new Error(
        `Missing daily_facts for dates: ${missingDates.join(", ")}`
      );
    }
    // All present and validated, return as Record<string, DailyFacts>
    return loaded as Record<string, DailyFacts>;
  }

  // For compute_on_miss, compute and persist missing dates
  if (mode === "compute_on_miss") {
    const result: Record<string, DailyFacts> = { ...loaded } as Record<
      string,
      DailyFacts
    >;

    if (missingDates.length > 0) {
      // First, ensure sky_state exists for all missing dates
      const skyStates = await getSkyStateRange(
        startDate,
        endDate,
        "compute_on_miss"
      );

      // For each missing date, derive facts from persisted sky_state
      for (const date of missingDates) {
        const skyState = skyStates[date];
        if (!skyState) {
          throw new Error(
            `Cannot compute daily_facts for ${date}: sky_state is missing and could not be computed`
          );
        }

        // Validate sky_state schema version matches what we expect
        if (skyState.schema_version !== "1.0.0") {
          throw new Error(
            `Sky state schema version mismatch for ${date}: expected "1.0.0", got "${skyState.schema_version}"`
          );
        }

        // Derive facts from persisted sky_state (not recomputing sky_state)
        const derivedFacts = deriveDailyFactsFromSkyState(skyState, policy, date);

        // Validate derived result
        const validated = DailyFactsSchema.parse(derivedFacts);

        // Validate that the derived facts reference the same sky_state metadata
        if (
          validated.source.sky_state_schema_version !== skyState.schema_version ||
          validated.source.engine !== skyState.meta.engine ||
          validated.source.engine_version !== skyState.meta.engine_version ||
          validated.source.ephemeris_fileset !== skyState.meta.ephemeris_fileset
        ) {
          throw new Error(
            `Source reference mismatch for ${date}: derived facts do not match sky_state metadata`
          );
        }

        // Persist it (upsert will only insert if missing, not overwrite existing)
        await upsertDailyFacts(validated);

        // Add to result
        result[date] = validated;
      }
    }

    return result;
  }

  // Should never reach here, but TypeScript needs this
  throw new Error(`Unknown mode: ${mode}`);
}

