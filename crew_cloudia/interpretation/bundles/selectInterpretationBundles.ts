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
  const phaseBundles: InterpretationBundle[] = [];
  const placementBundles: InterpretationBundle[] = [];
  const acceptedBundles: InterpretationBundle[] = [];

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

  for (const signal of input.signals) {
    const bundles = input.bundleIndex.get(signal.signal_key);
    if (!bundles || bundles.length === 0) {
      continue;
    }

    const { chosen } = chooseBundle(signal, bundles);
    if (!chosen) continue;
    if (signal.kind === "lunar_phase") {
      phaseBundles.push(chosen);
    } else if (signal.kind === "planet_in_sign") {
      placementBundles.push(chosen);
    } else {
      acceptedBundles.push(chosen);
    }
  }

  const primary: InterpretationBundle[] = [];
  const secondary: InterpretationBundle[] = [];

  const accepted = [...phaseBundles, ...placementBundles, ...acceptedBundles];
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
