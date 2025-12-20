import { describe, expect, it } from "vitest";
import { computeSkyState } from "../../../../astro/computeSkyState.js";

function elongationDeg(a: number, b: number): number {
  const raw = Math.abs((a % 360) - (b % 360));
  return Math.min(raw, 360 - raw);
}

describe("moon sign regression", () => {
  it("2025-12-19 new moon stays in Sagittarius at canonical timestamp", async () => {
    const sky = await computeSkyState({ date: "2025-12-19", timezone: "UTC" });
    const sun = sky.bodies.sun;
    const moon = sky.bodies.moon;

    expect(moon.sign).toBe("sagittarius");
    expect(moon.longitude).toBeGreaterThanOrEqual(240);
    expect(moon.longitude).toBeLessThan(270);

    const sep = elongationDeg(sun.longitude, moon.longitude);
    expect(sep).toBeLessThan(45); // classify as "new"-ish
  });

  it("2024-04-08 moon in Aries at canonical timestamp (sanity check)", async () => {
    const sky = await computeSkyState({ date: "2024-04-08", timezone: "UTC" });
    const moon = sky.bodies.moon;

    expect(moon.sign).toBe("aries");
    expect(moon.longitude).toBeGreaterThanOrEqual(0);
    expect(moon.longitude).toBeLessThan(30);
  });
});

