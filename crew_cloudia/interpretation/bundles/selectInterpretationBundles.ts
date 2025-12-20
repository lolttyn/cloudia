import { InterpretationBundle } from "../../canon/machine/bundles/interpretation_bundle_schema.js";
import { InterpretationSignal } from "../signals/signals.schema.js";
import { BundleIndex } from "./loadInterpretationBundles.js";

export type BundleSelection = {
  primary: InterpretationBundle[];
  secondary: InterpretationBundle[];
  suppressed: { bundle_slug: string; reason: string }[];
};

export type SelectBundlesInput = {
  signals: InterpretationSignal[];
  bundleIndex: BundleIndex;
};

export function selectInterpretationBundles(
  input: SelectBundlesInput
): BundleSelection {
  const suppressed: { bundle_slug: string; reason: string }[] = [];
  const acceptedNonLunation: InterpretationBundle[] = [];

  const chooseBundle = (signal: InterpretationSignal, bundles: InterpretationBundle[]) => {
    const sortedByVersion = [...bundles].sort((a, b) => b.version - a.version);
    let chosen: InterpretationBundle | null = null;

    for (const bundle of sortedByVersion) {
      const orbMax = bundle.trigger.constraints?.orb_max_degrees;
      if (orbMax !== undefined && signal.orb_deg !== undefined) {
        if (signal.orb_deg > orbMax) {
          suppressed.push({
            bundle_slug: bundle.slug,
            reason: "constraint_mismatch",
          });
          continue;
        }
      }
      chosen = bundle;
      break;
    }

    if (chosen) {
      return { chosen, sortedByVersion };
    }

    for (const bundle of sortedByVersion) {
      suppressed.push({
        bundle_slug: bundle.slug,
        reason: "constraint_mismatch",
      });
    }
    return { chosen: null, sortedByVersion };
  };

  // Detect lunation early and enforce dominance.
  const lunationSignals = input.signals
    .filter((s) => s.kind === "lunation")
    .sort((a, b) => {
      if (b.salience !== a.salience) return b.salience - a.salience;
      return a.signal_key.localeCompare(b.signal_key);
    });

  if (lunationSignals.length > 0) {
    const chosenLunationSignal = lunationSignals[0];
    const lunationBundles = input.bundleIndex.get(chosenLunationSignal.signal_key);
    if (!lunationBundles || lunationBundles.length === 0) {
      throw new Error(
        `Missing lunation bundle for signal ${chosenLunationSignal.signal_key}`
      );
    }

    const { chosen: lunationBundle } = chooseBundle(
      chosenLunationSignal,
      lunationBundles
    );

    if (!lunationBundle) {
      throw new Error(
        `Unable to satisfy constraints for lunation ${chosenLunationSignal.signal_key}`
      );
    }

    // Suppress everything else on a lunation day to keep a single core story.
    for (const signal of input.signals) {
      if (signal === chosenLunationSignal) continue;
      const bundles = input.bundleIndex.get(signal.signal_key);
      if (!bundles || bundles.length === 0) continue;
      bundles.forEach((bundle) =>
        suppressed.push({ bundle_slug: bundle.slug, reason: "lunation_dominance" })
      );
    }

    return {
      primary: [lunationBundle],
      secondary: [],
      suppressed,
    };
  }

  for (const signal of input.signals) {
    const bundles = input.bundleIndex.get(signal.signal_key);
    if (!bundles || bundles.length === 0) {
      continue;
    }

    const { chosen } = chooseBundle(signal, bundles);
    if (!chosen) continue;
    acceptedNonLunation.push(chosen);
  }

  const primary: InterpretationBundle[] = [];
  const secondary: InterpretationBundle[] = [];

  const accepted = [...acceptedNonLunation];
  accepted.forEach((bundle, idx) => {
    if (idx < 2) {
      primary.push(bundle);
    } else if (idx < 3) {
      secondary.push(bundle);
    } else {
      suppressed.push({ bundle_slug: bundle.slug, reason: "over_cap" });
    }
  });

  return { primary, secondary, suppressed };
}

