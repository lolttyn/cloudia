import { computeSkyState } from "../../../../astro/computeSkyState.js";
import { SkyState, SkyStateSchema } from "../../../../astro/schemas/skyState.schema.js";
import { loadSkyStateDailyRange } from "./loadSkyStateDailyRange.js";
import { upsertSkyStateDaily } from "./upsertSkyStateDaily.js";

export type LoadMode = "read_only" | "compute_on_miss" | "require";

/**
 * Orchestrator for loading sky_state with different modes
 */

// Overload for read_only mode (can return nulls)
export function getSkyStateRange(
  startDate: string,
  endDate: string,
  mode: "read_only"
): Promise<Record<string, SkyState | null>>;

// Overload for require/compute_on_miss modes (never null)
export function getSkyStateRange(
  startDate: string,
  endDate: string,
  mode: "require" | "compute_on_miss"
): Promise<Record<string, SkyState>>;

// Implementation
export async function getSkyStateRange(
  startDate: string,
  endDate: string,
  mode: LoadMode
): Promise<Record<string, SkyState | null> | Record<string, SkyState>> {
  // Always attempt DB load first
  const loaded = await loadSkyStateDailyRange(startDate, endDate);

  // For read_only, return as-is (with nulls)
  if (mode === "read_only") {
    return loaded;
  }

  // Check for missing dates
  const missingDates: string[] = [];
  for (const [date, state] of Object.entries(loaded)) {
    if (state === null) {
      missingDates.push(date);
    } else {
      // Validate schema_version - accept both 1.0.0 and 1.1.0
      const validVersions = ["1.0.0", "1.1.0"];
      if (!validVersions.includes(state.schema_version)) {
        throw new Error(
          `Schema version mismatch for ${date}: expected one of ${validVersions.join(", ")}, got "${state.schema_version}". Refusing to overwrite.`
        );
      }
    }
  }

  // For require mode, throw if any missing
  if (mode === "require") {
    if (missingDates.length > 0) {
      throw new Error(
        `Missing sky_state for dates: ${missingDates.join(", ")}`
      );
    }
    // All present and validated, return as Record<string, SkyState>
    return loaded as Record<string, SkyState>;
  }

  // For compute_on_miss, compute and persist missing dates
  if (mode === "compute_on_miss") {
    const result: Record<string, SkyState> = { ...loaded } as Record<
      string,
      SkyState
    >;

    for (const date of missingDates) {
      // Compute missing sky_state
      const computed = await computeSkyState({
        date,
        timezone: "UTC",
      });

      // Validate computed result
      const validated = SkyStateSchema.parse(computed);

      // Persist it
      await upsertSkyStateDaily(validated);

      // Add to result
      result[date] = validated;
    }

    return result;
  }

  // Should never reach here, but TypeScript needs this
  throw new Error(`Unknown mode: ${mode}`);
}

