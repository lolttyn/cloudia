import { describe, expect, it } from "vitest";
import { deriveSignalsFromSkyFeatures } from "../deriveSignalsFromSkyFeatures.js";
import { SkyFeatures } from "../../sky/extractSkyFeatures.js";

function baseFeatures(): SkyFeatures {
  return {
    date: "2025-12-19",
    sun: { sign: "Capricorn" },
    moon: { sign: "Leo", phase: "full" },
    highlights: [],
  };
}

describe("deriveSignalsFromSkyFeatures", () => {
  it("emits sun_in_<sign> with fixed salience", () => {
    const signals = deriveSignalsFromSkyFeatures(baseFeatures());
    const sunSignal = signals.find((s) => s.signal_key === "sun_in_capricorn");
    expect(sunSignal).toBeDefined();
    expect(sunSignal?.salience).toBe(0.35);
  });

  it("emits moon_in_<sign> with fixed salience", () => {
    const signals = deriveSignalsFromSkyFeatures({
      ...baseFeatures(),
      moon: { sign: "Leo", phase: "full" },
    });
    const moonSignal = signals.find((s) => s.signal_key === "moon_in_leo");
    expect(moonSignal).toBeDefined();
    expect(moonSignal?.salience).toBe(0.3);
    // Sorting stability with sun + moon + aspect
    const orderedKeys = signals.map((s) => s.signal_key);
    expect(new Set(orderedKeys).size).toBe(orderedKeys.length);
  });

  it("emits moon phase with phase salience", () => {
    const signals = deriveSignalsFromSkyFeatures(baseFeatures());
    const phase = signals.find((s) => s.signal_key === "moon_phase_full");
    expect(phase).toBeDefined();
    expect(phase?.salience).toBe(0.45);
  });

  it("emits sun-moon aspect with orb-based salience", () => {
    const signals = deriveSignalsFromSkyFeatures({
      ...baseFeatures(),
      highlights: [
        {
          type: "aspect" as const,
          bodies: ["Sun", "Moon"] as const,
          aspect: "square" as const,
          orb_deg: 3,
        },
      ],
    });
    const aspect = signals.find((s) => s.signal_key === "sun_moon_square");
    expect(aspect).toBeDefined();
    expect(aspect?.salience).toBeCloseTo(0.5, 5);
    expect(aspect?.orb_deg).toBe(3);
  });

  it("emits moon ingress with window and fixed salience", () => {
    const signals = deriveSignalsFromSkyFeatures({
      ...baseFeatures(),
      highlights: [
        {
          type: "ingress" as const,
          body: "Moon" as const,
          from_sign: "Cancer",
          to_sign: "Leo",
          window: "next_24h" as const,
        },
      ],
    });
    const ingress = signals.find((s) => s.signal_key === "moon_ingress_leo_next_24h");
    expect(ingress).toBeDefined();
    expect(ingress?.salience).toBe(0.2);
  });

  it("sorts deterministically by salience then signal_key", () => {
    const signalsA = deriveSignalsFromSkyFeatures({
      ...baseFeatures(),
      highlights: [
        {
          type: "aspect" as const,
          bodies: ["Sun", "Moon"] as const,
          aspect: "square" as const,
          orb_deg: 3,
        },
        {
          type: "ingress" as const,
          body: "Moon" as const,
          from_sign: "Cancer",
          to_sign: "Leo",
          window: "next_24h" as const,
        },
      ],
    });
    const signalsB = deriveSignalsFromSkyFeatures({
      ...baseFeatures(),
      highlights: [
        {
          type: "ingress" as const,
          body: "Moon" as const,
          from_sign: "Cancer",
          to_sign: "Leo",
          window: "next_24h" as const,
        },
        {
          type: "aspect" as const,
          bodies: ["Sun", "Moon"] as const,
          aspect: "square" as const,
          orb_deg: 3,
        },
      ],
    });
    expect(signalsA).toStrictEqual(signalsB);
    // Check sorted order: higher salience first, then key asc
    for (let i = 1; i < signalsA.length; i++) {
      const prev = signalsA[i - 1];
      const curr = signalsA[i];
      if (prev.salience === curr.salience) {
        expect(prev.signal_key.localeCompare(curr.signal_key) <= 0).toBe(true);
      } else {
        expect(prev.salience).toBeGreaterThanOrEqual(curr.salience);
      }
    }
  });
});

