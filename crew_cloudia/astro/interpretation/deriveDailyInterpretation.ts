/**
 * Phase 5.2 Step 3 — Derive DailyInterpretation from canonical inputs
 * 
 * Pure function that deterministically derives Layer 2 meaning from
 * Layer 0 (SkyStateDaily) + Layer 1 (DailyFacts) inputs.
 * 
 * This is DB-free and deterministic - all inputs come from InterpretationInputs.
 * No window logic (that's Phase 5.3).
 */

import { InterpretationInputs } from "./loadInterpretationInputs.js";
import {
  DailyInterpretationSchema,
  type DailyInterpretation,
} from "./schema/dailyInterpretation.schema.js";
import { deriveSignalsFromSkyFeatures } from "../../interpretation/signals/deriveSignalsFromSkyFeatures.js";
import { selectInterpretationBundles } from "../../interpretation/bundles/selectInterpretationBundles.js";
import { loadInterpretationBundles } from "../../interpretation/bundles/loadInterpretationBundles.js";

/**
 * Derive dominant contrast axis from sky state and daily facts
 * 
 * This is a placeholder implementation. The actual logic should derive
 * the axis from the primary transits and planetary positions.
 */
function deriveDominantAxis(
  inputs: InterpretationInputs
): DailyInterpretation["dominant_contrast_axis"] {
  const { sky_state, daily_facts } = inputs;
  
  // Placeholder: derive from primary transits
  // TODO: Implement actual axis derivation logic
  const primaryTransits = daily_facts.interpreter_transits_v1.filter(
    (t) => t.salience === "primary"
  );
  
  if (primaryTransits.length > 0) {
    const first = primaryTransits[0];
    // Placeholder logic - should be more sophisticated
    return {
      statement: `${first.planet} in ${first.sign} over background conditions`,
      primary: `${first.planet} in ${first.sign}`,
      counter: "background conditions",
    };
  }
  
  // Fallback
  return {
    statement: "stability over change",
    primary: "stability",
    counter: "change",
  };
}

/**
 * Derive why_today from primary transits and conditions
 */
function deriveWhyToday(inputs: InterpretationInputs): string[] {
  const { daily_facts } = inputs;
  const primaryTransits = daily_facts.interpreter_transits_v1.filter(
    (t) => t.salience === "primary"
  );
  
  const reasons: string[] = [];
  
  for (const transit of primaryTransits.slice(0, 3)) {
    reasons.push(`${transit.planet} in ${transit.sign} with ${transit.orb_deg}° orb`);
  }
  
  if (reasons.length === 0) {
    reasons.push("Background conditions dominate");
  }
  
  return reasons;
}

/**
 * Derive sky anchors from sky state
 */
function deriveSkyAnchors(inputs: InterpretationInputs): DailyInterpretation["sky_anchors"] {
  const { sky_state } = inputs;
  const anchors: DailyInterpretation["sky_anchors"] = [];
  
  // Sun anchor
  if (sky_state.bodies.sun) {
    anchors.push({
      body: "sun",
      sign: sky_state.bodies.sun.sign,
      description: `Sun in ${sky_state.bodies.sun.sign}`,
    });
  }
  
  // Moon anchor
  if (sky_state.bodies.moon) {
    anchors.push({
      body: "moon",
      sign: sky_state.bodies.moon.sign,
      description: `Moon in ${sky_state.bodies.moon.sign}`,
    });
  }
  
  return anchors;
}

/**
 * Derive causal logic from transits
 */
function deriveCausalLogic(inputs: InterpretationInputs): string[] {
  const { daily_facts } = inputs;
  const primaryTransits = daily_facts.interpreter_transits_v1.filter(
    (t) => t.salience === "primary"
  );
  
  const logic: string[] = [];
  
  for (const transit of primaryTransits.slice(0, 2)) {
    logic.push(`${transit.planet} in ${transit.sign} creates ${transit.salience} influence`);
  }
  
  if (logic.length === 0) {
    logic.push("Background conditions provide steady context");
  }
  
  return logic;
}

/**
 * Derive confidence level from transits
 */
function deriveConfidenceLevel(inputs: InterpretationInputs): "high" | "medium" | "low" {
  const { daily_facts } = inputs;
  const primaryCount = daily_facts.interpreter_transits_v1.filter(
    (t) => t.salience === "primary"
  ).length;
  const secondaryCount = daily_facts.interpreter_transits_v1.filter(
    (t) => t.salience === "secondary"
  ).length;
  
  if (primaryCount >= 2) {
    return "high";
  } else if (primaryCount >= 1 || secondaryCount >= 2) {
    return "medium";
  } else {
    return "low";
  }
}

/**
 * Pure function: Derive DailyInterpretation from canonical inputs
 * 
 * @param inputs - Canonical Layer 0 + Layer 1 inputs
 * @returns DailyInterpretation (validated)
 */
export function deriveDailyInterpretation(
  inputs: InterpretationInputs
): DailyInterpretation {
  const { sky_state, daily_facts, timestamp, meta } = inputs;
  
  // Derive signals (using existing signal derivation logic)
  // Note: This requires converting SkyState to SkyFeatures format
  // For now, we'll create a minimal conversion
  const signals = daily_facts.interpreter_transits_v1.map((t) => ({
    signal_key: `${t.planet}_in_${t.sign}`,
    salience: t.salience,
    description: `${t.planet} in ${t.sign}`,
  }));
  
  // Load and select interpretation bundles
  const bundleIndex = loadInterpretationBundles();
  const selectedBundles = selectInterpretationBundles({
    signals: signals.map((s) => ({ signal_key: s.signal_key })),
    bundleIndex,
  });
  
  // Derive core meaning fields
  const dominant_contrast_axis = deriveDominantAxis(inputs);
  const why_today = deriveWhyToday(inputs);
  const why_today_clause = why_today[0] || "Today's configuration offers unique opportunities";
  const sky_anchors = deriveSkyAnchors(inputs);
  const causal_logic = deriveCausalLogic(inputs);
  const confidence_level = deriveConfidenceLevel(inputs);
  
  // Build interpretation bundles structure
  const interpretation_bundles = {
    primary: selectedBundles.primary.map((b) => ({
      bundle_id: b.bundle_id,
      bundle_slug: b.bundle_id, // TODO: extract slug properly
      salience_class: "primary" as const,
    })),
    secondary: selectedBundles.secondary.map((b) => ({
      bundle_id: b.bundle_id,
      bundle_slug: b.bundle_id,
      salience_class: "secondary" as const,
    })),
    background: selectedBundles.suppressed.map((b) => ({
      bundle_id: b.bundle_slug,
      bundle_slug: b.bundle_slug,
      salience_class: "background" as const,
    })),
  };
  
  const dailyInterpretation = {
    schema_version: "1.0.0",
    date: timestamp.date,
    dominant_contrast_axis,
    why_today,
    why_today_clause,
    sky_anchors,
    causal_logic,
    supporting_themes: [], // TODO: derive from transits
    tone_descriptor: "balanced", // TODO: derive from transits and conditions
    signals,
    interpretation_bundles,
    confidence_level,
    provenance: {
      sky_state_date: timestamp.date,
      sky_state_version: meta?.sky_state_version,
      daily_facts_date: timestamp.date,
      daily_facts_policy_version: meta?.daily_facts_policy_version,
    },
  };
  
  return DailyInterpretationSchema.parse(dailyInterpretation);
}

