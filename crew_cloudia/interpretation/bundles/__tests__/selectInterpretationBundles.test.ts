import { describe, expect, it } from "vitest";
import { loadInterpretationBundles } from "../loadInterpretationBundles.js";
import { selectInterpretationBundles } from "../selectInterpretationBundles.js";
import { InterpretationBundle } from "../../../canon/machine/bundles/interpretation_bundle_schema.js";
import { InterpretationSignal } from "../../signals/signals.schema.js";

const bundleIndex = loadInterpretationBundles();

const baseSignal = (signal_key: string, salience: number): InterpretationSignal => ({
  signal_key,
  kind: "aspect",
  salience,
  source: "sky_features",
});

describe("selectInterpretationBundles", () => {
  it("selects a matching bundle as primary", () => {
    const signals: InterpretationSignal[] = [
      baseSignal("sun_in_capricorn", 0.9),
    ];

    const result = selectInterpretationBundles({ signals, bundleIndex });
    expect(result.primary[0]?.slug).toBe("sun_in_capricorn");
    expect(result.secondary).toHaveLength(0);
  });

  it("respects signal salience ordering across multiple matches", () => {
    const signals: InterpretationSignal[] = [
      { ...baseSignal("sun_in_capricorn", 0.9), kind: "planet_in_sign" },
      { ...baseSignal("sun_square_mars", 0.4), kind: "aspect", orb_deg: 2 },
    ];

    const result = selectInterpretationBundles({ signals, bundleIndex });
    expect(result.primary.map((b) => b.slug)).toEqual([
      "sun_in_capricorn",
      "sun_square_mars",
    ]);
  });

  it("prefers the highest bundle version for the same signal_key", () => {
    const baseBundle = bundleIndex.get("sun_in_capricorn")?.[0];
    expect(baseBundle).toBeDefined();
    const newer: InterpretationBundle = { ...baseBundle!, version: (baseBundle!.version || 1) + 1 };
    const customIndex = new Map<string, InterpretationBundle[]>([
      ["sun_in_capricorn", [baseBundle!, newer]],
    ]);

    const result = selectInterpretationBundles({
      signals: [{ ...baseSignal("sun_in_capricorn", 0.9), kind: "planet_in_sign" }],
      bundleIndex: customIndex,
    });

    expect(result.primary[0]?.version).toBe(newer.version);
  });

  it("suppresses bundles that fail orb constraints", () => {
    const result = selectInterpretationBundles({
      signals: [{ ...baseSignal("saturn_conjunct_mars", 0.8), orb_deg: 4 }],
      bundleIndex,
    });

    expect(result.primary).toHaveLength(0);
    expect(result.secondary).toHaveLength(0);
    expect(result.suppressed).toContainEqual({
      bundle_slug: "saturn_conjunct_mars",
      reason: "constraint_mismatch",
    });
  });

  it("enforces primary/secondary caps (2 primary, 1 secondary)", () => {
    const signals: InterpretationSignal[] = [
      { ...baseSignal("sun_in_capricorn", 0.9), kind: "planet_in_sign" },
      { ...baseSignal("sun_square_mars", 0.85), orb_deg: 2 },
      { ...baseSignal("sun_square_mercury", 0.8), orb_deg: 2 },
      { ...baseSignal("sun_conjunction_venus", 0.75), orb_deg: 1 },
      { ...baseSignal("sun_trine_mars", 0.7), orb_deg: 2 },
    ];

    const result = selectInterpretationBundles({ signals, bundleIndex });

    expect(result.primary).toHaveLength(2);
    expect(result.secondary).toHaveLength(1);
    expect(result.suppressed.length).toBeGreaterThanOrEqual(1);
    expect(result.suppressed).toContainEqual(
      expect.objectContaining({ reason: "over_cap" })
    );
  });

  it("is deterministic for the same inputs", () => {
    const signals: InterpretationSignal[] = [
      { ...baseSignal("sun_in_capricorn", 0.9), kind: "planet_in_sign" },
      { ...baseSignal("sun_square_mars", 0.4), orb_deg: 2 },
    ];

    const first = selectInterpretationBundles({ signals, bundleIndex });
    const second = selectInterpretationBundles({ signals, bundleIndex });

    expect(first).toStrictEqual(second);
  });
});

