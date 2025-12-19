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
  const accepted: InterpretationBundle[] = [];
  const suppressed: { bundle_slug: string; reason: string }[] = [];

  for (const signal of input.signals) {
    const bundles = input.bundleIndex.get(signal.signal_key);
    if (!bundles || bundles.length === 0) {
      continue;
    }

    const sortedByVersion = [...bundles].sort(
      (a, b) => b.version - a.version
    );

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
      accepted.push(chosen);
    } else {
      // No bundle passed constraints for this signal.
      for (const bundle of sortedByVersion) {
        suppressed.push({
          bundle_slug: bundle.slug,
          reason: "constraint_mismatch",
        });
      }
    }
  }

  const primary: InterpretationBundle[] = [];
  const secondary: InterpretationBundle[] = [];

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

