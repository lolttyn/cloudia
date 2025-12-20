import { describe, expect, it } from "vitest";
import { selectInterpretationBundles } from "../selectInterpretationBundles.js";
import { loadInterpretationBundles } from "../loadInterpretationBundles.js";
import { InterpretationSignal } from "../../signals/signals.schema.js";

describe("selectInterpretationBundles - lunation priority", () => {
  it("prioritizes lunation bundle as primary[0]", () => {
    const bundleIndex = loadInterpretationBundles();
    const signals: InterpretationSignal[] = [
      {
        signal_key: "new_moon_in_sagittarius",
        kind: "lunation",
        salience: 0.95,
        source: "sky_features",
      },
      {
        signal_key: "sun_in_sagittarius",
        kind: "planet_in_sign",
        salience: 0.35,
        source: "sky_features",
      },
    ];

    const selection = selectInterpretationBundles({ signals, bundleIndex });
    expect(selection.primary[0]?.slug).toBe("new_moon_in_sagittarius");
    expect(selection.primary.length).toBeGreaterThanOrEqual(1);
  });
});

