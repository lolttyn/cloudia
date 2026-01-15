import { describe, expect, it } from "vitest";
import { computeLunarPhase } from "../computeLunar.js";

describe("computeLunarPhase", () => {
  it("uses directed elongation to distinguish waxing vs waning (regression)", () => {
    // Example geometry (from a real daily row investigation):
    // sun ≈ 295.34°, moon ≈ 258.07° → elongation = (moon - sun + 360) % 360 ≈ 322.73°
    const sunLon = 295.34;
    const moonLon = 258.07;

    const lunar = computeLunarPhase(sunLon, moonLon);

    expect(lunar.elongation_deg).toBeGreaterThan(320);
    expect(lunar.elongation_deg).toBeLessThan(325);
    expect(lunar.phase_angle_abs_deg).toBeGreaterThan(35);
    expect(lunar.phase_angle_abs_deg).toBeLessThan(40);
    // Back-compat alias stays equal to the abs angle
    expect(lunar.phase_angle_deg).toBeCloseTo(lunar.phase_angle_abs_deg, 2);
    // Directional label should be waning crescent, not waxing crescent
    expect(lunar.phase_name).toBe("waning_crescent");
  });
});

