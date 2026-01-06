import { describe, expect, it } from "vitest";
import { computeSkyState } from "../computeSkyState.js";
import { SkyStateSchema } from "../schemas/skyState.schema.js";

/**
 * Helper to strip timestamp_generated for determinism comparison.
 * Creates a deep copy and removes the non-deterministic field.
 */
function stripGeneratedTimestamp(state: unknown): unknown {
  const copy = structuredClone(state) as Record<string, unknown>;
  if (copy.meta && typeof copy.meta === "object" && "timestamp_generated" in copy.meta) {
    const metaCopy = { ...(copy.meta as Record<string, unknown>) };
    delete metaCopy.timestamp_generated;
    copy.meta = metaCopy;
  }
  return copy;
}

describe("computeSkyState", () => {
  it("validates against sky_state v1.0.0 schema", async () => {
    const result = await computeSkyState({ date: "2025-12-19", timezone: "UTC" });

    // Validate with schema - should not throw
    expect(() => {
      SkyStateSchema.parse(result);
    }).not.toThrow();
  });

  it("produces deterministic output for same input", async () => {
    const date = "2025-12-19";
    const input = { date, timezone: "UTC" as const };

    const result1 = await computeSkyState(input);
    const result2 = await computeSkyState(input);

    // Strip timestamp_generated for comparison
    const stripped1 = stripGeneratedTimestamp(result1);
    const stripped2 = stripGeneratedTimestamp(result2);

    // Deep equality check
    expect(stripped1).toEqual(stripped2);
  });

  it("produces valid astronomical data (sanity checks)", async () => {
    const result = await computeSkyState({ date: "2025-12-19", timezone: "UTC" });

    // timestamp.julian_day is a finite number
    expect(Number.isFinite(result.timestamp.julian_day)).toBe(true);
    expect(result.timestamp.julian_day).toBeGreaterThan(0);

    // bodies.sun and bodies.moon exist
    expect(result.bodies.sun).toBeDefined();
    expect(result.bodies.moon).toBeDefined();

    // For each body, validate numeric fields
    for (const [bodyName, body] of Object.entries(result.bodies)) {
      // longitude is >= 0 and < 360
      expect(body.longitude).toBeGreaterThanOrEqual(0);
      expect(body.longitude).toBeLessThan(360);
      expect(Number.isFinite(body.longitude)).toBe(true);
      expect(body.longitude).not.toBeNaN();

      // speed_deg_per_day is finite
      expect(Number.isFinite(body.speed_deg_per_day)).toBe(true);
      expect(body.speed_deg_per_day).not.toBeNaN();

      // sign_degree is >= 0 and <= 30
      expect(body.sign_degree).toBeGreaterThanOrEqual(0);
      expect(body.sign_degree).toBeLessThanOrEqual(30);
      expect(Number.isFinite(body.sign_degree)).toBe(true);
      expect(body.sign_degree).not.toBeNaN();

      // Optional fields: if present, must be finite and not NaN
      if (body.latitude !== undefined) {
        expect(Number.isFinite(body.latitude)).toBe(true);
        expect(body.latitude).not.toBeNaN();
      }
      if (body.distance_au !== undefined) {
        expect(Number.isFinite(body.distance_au)).toBe(true);
        expect(body.distance_au).not.toBeNaN();
        expect(body.distance_au).toBeGreaterThan(0);
      }
    }

    // Validate aspects array structure
    for (const aspect of result.aspects) {
      expect(aspect.body_a).toBeDefined();
      expect(aspect.body_b).toBeDefined();
      expect(aspect.type).toBeDefined();
      expect(Number.isFinite(aspect.orb_deg)).toBe(true);
      expect(aspect.orb_deg).not.toBeNaN();
      expect(aspect.orb_deg).toBeGreaterThanOrEqual(0);
      expect(aspect.orb_deg).toBeLessThanOrEqual(180);
    }

    // Validate lunar phase data
    expect(result.lunar.phase_name).toBeDefined();
    expect(Number.isFinite(result.lunar.phase_angle_deg)).toBe(true);
    expect(result.lunar.phase_angle_deg).not.toBeNaN();
    expect(result.lunar.phase_angle_deg).toBeGreaterThanOrEqual(0);
    expect(result.lunar.phase_angle_deg).toBeLessThanOrEqual(180);
    expect(Number.isFinite(result.lunar.illumination_pct)).toBe(true);
    expect(result.lunar.illumination_pct).not.toBeNaN();
    expect(result.lunar.illumination_pct).toBeGreaterThanOrEqual(0);
    expect(result.lunar.illumination_pct).toBeLessThanOrEqual(100);
  });
});

