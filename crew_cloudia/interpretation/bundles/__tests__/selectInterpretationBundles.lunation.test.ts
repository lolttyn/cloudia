import { describe, expect, it } from "vitest";
import { selectInterpretationBundles } from "../selectInterpretationBundles.js";
import { loadInterpretationBundles } from "../loadInterpretationBundles.js";
import { InterpretationSignal } from "../../signals/signals.schema.js";

describe("selectInterpretationBundles - lunation context", () => {
  it("falls back to phase and placements when lunation overlay is missing", () => {
    const baseIndex = loadInterpretationBundles();
    const bundleIndex = new Map([...baseIndex.entries()]);
    bundleIndex.delete("new_moon_in_sagittarius");

    const signals: InterpretationSignal[] = [
      {
        signal_key: "moon_phase_new",
        kind: "lunar_phase",
        salience: 0.45,
        source: "sky_features",
      },
      {
        signal_key: "sun_in_sagittarius",
        kind: "planet_in_sign",
        salience: 0.35,
        source: "sky_features",
      },
      {
        signal_key: "moon_in_sagittarius",
        kind: "planet_in_sign",
        salience: 0.3,
        source: "sky_features",
      },
      {
        signal_key: "new_moon_in_sagittarius",
        kind: "lunation",
        salience: 0.95,
        source: "sky_features",
      },
    ];

    const selection = selectInterpretationBundles({ signals, bundleIndex });
    expect(selection.primary[0]?.trigger.signal_key).toBe("moon_phase_new");
    expect(selection.primary.map((b) => b.slug)).toContain("sun_in_sagittarius");
    expect(selection.secondary.map((b) => b.slug)).toContain("moon_in_sagittarius");
    expect(selection.suppressed.length).toBe(0);
  });

  it("still considers a lunation bundle without excluding placements", () => {
    const bundleIndex = loadInterpretationBundles();
    const signals: InterpretationSignal[] = [
      {
        signal_key: "moon_phase_new",
        kind: "lunar_phase",
        salience: 0.45,
        source: "sky_features",
      },
      {
        signal_key: "sun_in_sagittarius",
        kind: "planet_in_sign",
        salience: 0.35,
        source: "sky_features",
      },
      {
        signal_key: "moon_in_sagittarius",
        kind: "planet_in_sign",
        salience: 0.3,
        source: "sky_features",
      },
      {
        signal_key: "new_moon_in_sagittarius",
        kind: "lunation",
        salience: 0.95,
        source: "sky_features",
      },
    ];

    const selection = selectInterpretationBundles({ signals, bundleIndex });
    expect(selection.primary[0]?.trigger.signal_key).toBe("moon_phase_new");
    expect(selection.primary.map((b) => b.trigger.signal_key)).toContain("sun_in_sagittarius");
    const suppressedLunation = selection.suppressed.find(
      (s) => s.bundle_slug === "new_moon_in_sagittarius"
    );
    expect(suppressedLunation?.reason ?? "selected").toBe("over_cap");
    expect(selection.suppressed.find((s) => s.reason === "lunation_dominance")).toBeUndefined();
  });
});
