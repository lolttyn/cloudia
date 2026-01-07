/**
 * Phase D2 — Shared bundle hydration utilities
 * 
 * Production boundary: When canonical path is used in production, this module
 * provides the hydration functions to convert bundle refs → full bundles at
 * the boundary where InterpretiveFrame is needed.
 * 
 * Used by:
 * - Parity tests (via test helpers)
 * - Future production boundary (when switching from legacy to canonical)
 */

import { loadInterpretationBundles } from "../../interpretation/bundles/loadInterpretationBundles.js";
import type { InterpretationBundle } from "../../canon/machine/bundles/interpretation_bundle_schema.js";
import type { InterpretationBundleRef } from "./schema/dailyInterpretation.schema.js";

// Module-level cache for bundle index (computed once per process)
let cachedBundleIndex: Map<string, InterpretationBundle> | null = null;

/**
 * Build flat bundle index from canon bundle sources
 * 
 * Returns a Map<bundle_slug, InterpretationBundle> for fast lookup.
 * Uses highest version when multiple versions exist for the same slug.
 * 
 * This is the shared index builder used by both tests and production boundary.
 * 
 * PERFORMANCE: Index is computed once per process and cached. This ensures:
 * - Deterministic ordering (stable source of truth)
 * - No repeated file I/O in batch runs
 * - Single computation per test run
 * 
 * @returns Cached flat index of bundles by slug
 */
export function buildBundleIndex(): Map<string, InterpretationBundle> {
  if (cachedBundleIndex !== null) {
    return cachedBundleIndex;
  }
  
  const bundleIndex = loadInterpretationBundles();
  const flatIndex = new Map<string, InterpretationBundle>();
  
  // Flatten the bundle index (signal_key -> bundles[]) to (slug -> highest version bundle)
  // Sort signal keys for deterministic ordering
  const sortedSignalKeys = Array.from(bundleIndex.keys()).sort();
  for (const signalKey of sortedSignalKeys) {
    const bundleList = bundleIndex.get(signalKey);
    if (!bundleList) continue;
    
    // Sort bundles by version (descending) for deterministic selection
    const sortedBundles = [...bundleList].sort((a, b) => b.version - a.version);
    for (const bundle of sortedBundles) {
      const existing = flatIndex.get(bundle.slug);
      if (!existing || bundle.version > existing.version) {
        flatIndex.set(bundle.slug, bundle);
      }
    }
  }
  
  cachedBundleIndex = flatIndex;
  return flatIndex;
}

/**
 * Hydrate interpretation bundle refs to full bundles
 * 
 * Preserves ordering exactly as refs appear (don't sort unless legacy sorts).
 * Throws hard if a ref can't be found in the index (that's a real bug).
 * 
 * This is the shared hydrator used by both tests and production boundary.
 * 
 * @param refs - Array of bundle refs to hydrate
 * @param bundleIndex - Flat index of bundles by slug (from buildBundleIndex())
 * @returns Array of full InterpretationBundle objects in the same order as refs
 */
export function hydrateInterpretationBundleRefs(
  refs: InterpretationBundleRef[],
  bundleIndex: Map<string, InterpretationBundle>
): InterpretationBundle[] {
  return refs.map(ref => {
    const bundle = bundleIndex.get(ref.bundle_slug);
    if (!bundle) {
      throw new Error(
        `Bundle ref not found in index: ${ref.bundle_slug}. ` +
        `This is a real bug, not a snapshot issue.`
      );
    }
    return bundle;
  });
}

