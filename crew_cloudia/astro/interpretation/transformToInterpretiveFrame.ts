/**
 * Phase 5.2 Step 4 — Transform DailyInterpretation → InterpretiveFrame
 * 
 * Preserves downstream expectations exactly by transforming the canonical
 * DailyInterpretation to the InterpretiveFrame shape that downstream code expects.
 * 
 * Window logic fields (temporal_phase, continuity, temporal_arc) are set to
 * defaults/placeholders until Phase 5.3.
 */

import { type DailyInterpretation } from "./schema/dailyInterpretation.schema.js";
import { InterpretiveFrameSchema, type InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { loadInterpretationBundles } from "../../interpretation/bundles/loadInterpretationBundles.js";
import type { InterpretationSignal } from "../../interpretation/signals/signals.schema.js";

/**
 * Transform sky anchors from DailyInterpretation format to InterpretiveFrame format
 */
function transformSkyAnchors(
  anchors: DailyInterpretation["sky_anchors"]
): InterpretiveFrame["sky_anchors"] {
  return anchors.map((anchor) => {
    // Determine type based on body
    let type: "sun_sign" | "moon_sign" | "major_aspect";
    if (anchor.body === "sun") {
      type = "sun_sign";
    } else if (anchor.body === "moon") {
      type = "moon_sign";
    } else {
      type = "major_aspect";
    }
    
    return {
      type,
      label: anchor.description, // Use description as label
      meaning: anchor.description, // Use description as meaning (can be refined later)
    };
  });
}

/**
 * Transform signals from DailyInterpretation format to InterpretiveFrame format
 */
function transformSignals(
  signals: DailyInterpretation["signals"]
): InterpretiveFrame["signals"] {
  // Convert to InterpretiveFrame signal format
  // The structure should match InterpretationSignalSchema
  return signals.map((signal): InterpretationSignal => {
    // Return in the format expected by InterpretiveFrame
    // This is a placeholder - actual structure depends on InterpretationSignalSchema
    return {
      signal_key: signal.signal_key,
      salience: signal.salience,
      // Add other required fields as needed
    } as InterpretationSignal;
  });
}

/**
 * Transform interpretation bundles from refs to full bundles
 */
function transformInterpretationBundles(
  bundleRefs: DailyInterpretation["interpretation_bundles"]
): InterpretiveFrame["interpretation_bundles"] {
  const bundleIndex = loadInterpretationBundles();
  
  // Load full bundles from refs
  const primary: InterpretiveFrame["interpretation_bundles"]["primary"] = [];
  const secondary: InterpretiveFrame["interpretation_bundles"]["secondary"] = [];
  const suppressed: InterpretiveFrame["interpretation_bundles"]["suppressed"] = [];
  
  // Map bundle refs to full bundles
  for (const ref of bundleRefs.primary) {
    // Find bundle in index
    // This is simplified - actual lookup logic may be more complex
    const bundles = bundleIndex.get(ref.signal_key) || [];
    if (bundles.length > 0) {
      primary.push(bundles[0]); // Take first matching bundle
    }
  }
  
  for (const ref of bundleRefs.secondary) {
    const bundles = bundleIndex.get(ref.signal_key) || [];
    if (bundles.length > 0) {
      secondary.push(bundles[0]);
    }
  }
  
  for (const ref of bundleRefs.background) {
    suppressed.push({
      bundle_slug: ref.bundle_slug,
      reason: "background salience",
    });
  }
  
  return { primary, secondary, suppressed };
}

/**
 * Transform DailyInterpretation to InterpretiveFrame
 * 
 * @param dailyInterpretation - Canonical Layer 2 meaning object
 * @returns InterpretiveFrame matching downstream expectations
 */
export function transformToInterpretiveFrame(
  dailyInterpretation: DailyInterpretation
): InterpretiveFrame {
  // Transform core fields (direct mapping)
  const dominant_contrast_axis = dailyInterpretation.dominant_contrast_axis;
  const why_today = dailyInterpretation.why_today;
  const why_today_clause = dailyInterpretation.why_today_clause;
  const causal_logic = dailyInterpretation.causal_logic;
  const supporting_themes = dailyInterpretation.supporting_themes;
  const tone_descriptor = dailyInterpretation.tone_descriptor;
  const confidence_level = dailyInterpretation.confidence_level;
  
  // Transform structured fields
  const sky_anchors = transformSkyAnchors(dailyInterpretation.sky_anchors);
  const signals = transformSignals(dailyInterpretation.signals);
  const interpretation_bundles = transformInterpretationBundles(
    dailyInterpretation.interpretation_bundles
  );
  
  // Window logic fields (Phase 5.3 placeholders)
  const temporal_phase: InterpretiveFrame["temporal_phase"] = "baseline";
  const intensity_modifier: InterpretiveFrame["intensity_modifier"] = "emerging";
  const continuity: InterpretiveFrame["continuity"] = {}; // No window logic yet
  const temporal_arc: InterpretiveFrame["temporal_arc"] = {
    type: "none",
    phase: "baseline",
    intensity: "emerging",
    arc_day_index: 1,
    arc_total_days: 1,
  };
  const timing: InterpretiveFrame["timing"] = {
    state: "building",
    notes: "Phase 5.2: window logic pending",
  };
  
  // Optional fields
  const lunation: InterpretiveFrame["lunation"] = undefined; // TODO: derive from signals
  
  // Canon compliance (empty for now)
  const canon_compliance: InterpretiveFrame["canon_compliance"] = {
    violations: [],
    notes: [`Phase 5.2: derived from canonical inputs`],
  };
  
  const frame: InterpretiveFrame = {
    date: dailyInterpretation.date,
    dominant_contrast_axis,
    tone_descriptor,
    why_today,
    supporting_themes,
    sky_anchors,
    causal_logic,
    why_today_clause,
    temporal_phase,
    intensity_modifier,
    continuity,
    temporal_arc,
    timing,
    signals,
    interpretation_bundles,
    confidence_level,
    canon_compliance,
    ...(lunation ? { lunation } : {}),
  };
  
  return InterpretiveFrameSchema.parse(frame);
}

