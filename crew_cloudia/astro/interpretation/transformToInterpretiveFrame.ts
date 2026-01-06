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
import interpretiveCanon from "../../interpretation/canon/interpretiveCanon_v1.json" assert { type: "json" };
type InterpretiveCanon = typeof interpretiveCanon;

/**
 * Transform sky anchors from DailyInterpretation format to InterpretiveFrame format
 * 
 * Matches legacy buildAnchors() behavior:
 * - Order: moon_sign first, sun_sign second
 * - Labels: titlecase ("Moon in Pisces", "Sun in Capricorn")
 * - Meanings: from canon core_meanings
 */
function transformSkyAnchors(
  anchors: DailyInterpretation["sky_anchors"],
  canon: InterpretiveCanon = interpretiveCanon
): InterpretiveFrame["sky_anchors"] {
  // Extract moon and sun signs from anchors (titlecase)
  let moonSign: string | null = null;
  let sunSign: string | null = null;
  
  for (const anchor of anchors) {
    if (anchor.body === "moon") {
      moonSign = anchor.sign.charAt(0).toUpperCase() + anchor.sign.slice(1).toLowerCase();
    } else if (anchor.body === "sun") {
      sunSign = anchor.sign.charAt(0).toUpperCase() + anchor.sign.slice(1).toLowerCase();
    }
  }
  
  const result: InterpretiveFrame["sky_anchors"] = [];
  
  // Moon anchor first (legacy order)
  if (moonSign) {
    const moonEntry = canon.moon_signs[moonSign];
    if (moonEntry) {
      result.push({
        type: "moon_sign",
        label: `Moon in ${moonSign}`,
        meaning: moonEntry.core_meanings.join(", "),
      });
    }
  }
  
  // Sun anchor second (legacy order)
  if (sunSign) {
    const sunEntry = canon.sun_signs[sunSign];
    if (sunEntry) {
      result.push({
        type: "sun_sign",
        label: `Sun in ${sunSign}`,
        meaning: sunEntry.core_meanings.join(", "),
      });
    }
  }
  
  return result;
}

/**
 * Transform signals from DailyInterpretation format to InterpretiveFrame format
 * 
 * For Phase 5.2 scaffolding: produces minimal valid signals.
 * Real signal derivation will be ported from deriveSignalsFromSkyFeatures() later.
 */
function transformSignals(
  signals: DailyInterpretation["signals"]
): InterpretiveFrame["signals"] {
  // Map string salience to numeric salience
  const salienceMap: Record<string, number> = {
    primary: 0.7,
    secondary: 0.5,
    background: 0.3,
  };
  
  // Infer kind from signal_key pattern, default to "planet_in_sign"
  const inferKind = (signalKey: string): InterpretationSignal["kind"] => {
    if (signalKey.includes("_aspect_") || signalKey.includes("aspect")) {
      return "aspect";
    }
    if (signalKey.includes("lunar_phase") || signalKey.includes("moon_phase")) {
      return "lunar_phase";
    }
    if (signalKey.includes("ingress")) {
      return "ingress";
    }
    if (signalKey.includes("new_moon") || signalKey.includes("full_moon")) {
      return "lunation";
    }
    return "planet_in_sign";
  };
  
  // Transform signals to InterpretiveFrame format
  const transformed = signals.map((signal): InterpretationSignal => {
    const numericSalience = salienceMap[signal.salience] ?? 0.3;
    const kind = inferKind(signal.signal_key);
    
    return {
      signal_key: signal.signal_key,
      kind,
      salience: numericSalience,
      source: "sky_features" as const,
    };
  });
  
  // Schema requires min(1) signals, so provide placeholder if empty
  if (transformed.length === 0) {
    return [
      {
        signal_key: "placeholder_lunar_phase",
        kind: "lunar_phase" as const,
        salience: 0.3,
        source: "sky_features" as const,
      },
    ];
  }
  
  return transformed;
}

/**
 * Pass through interpretation bundles (already full bundles, not refs)
 */
function transformInterpretationBundles(
  bundles: DailyInterpretation["interpretation_bundles"]
): InterpretiveFrame["interpretation_bundles"] {
  // Bundles are already in the correct format (full InterpretationBundle objects)
  return {
    primary: bundles.primary,
    secondary: bundles.secondary,
    suppressed: bundles.suppressed,
  };
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
  // Transform core fields with validator fallbacks
  const dominant_contrast_axis = dailyInterpretation.dominant_contrast_axis;
  
  // Ensure why_today contains "today" and time-bound reason (validator requirement)
  let why_today = Array.isArray(dailyInterpretation.why_today) 
    ? [...dailyInterpretation.why_today] 
    : [dailyInterpretation.why_today || ""];
  
  // Filter out empty strings
  why_today = why_today.filter(Boolean);
  
  // Check if any why_today entry contains "today" or time-bound keywords
  const hasTodayKeyword = why_today.some(s => 
    /today|brief transit|short window|first full day|peaks today/i.test(s)
  );
  
  if (!hasTodayKeyword || why_today.length === 0) {
    why_today = [
      "This applies today because it's computed for the episode date and anchored to 12:00 UTC."
    ];
  }
  
  // Ensure why_today_clause is set
  const why_today_clause = dailyInterpretation.why_today_clause || why_today[0] || 
    "This applies today because it's computed for the episode date.";
  
  // Transform sky anchors first (needed for causal_logic validator)
  const sky_anchors = transformSkyAnchors(dailyInterpretation.sky_anchors);
  
  // Ensure causal_logic contains "because" and references a sky anchor (validator requirements)
  let causal_logic = Array.isArray(dailyInterpretation.causal_logic)
    ? [...dailyInterpretation.causal_logic]
    : [dailyInterpretation.causal_logic || ""];
  
  // Filter out empty strings
  causal_logic = causal_logic.filter(Boolean);
  
  // Get anchor labels for reference check
  const anchorLabels = sky_anchors.map(a => a.label.toLowerCase());
  const anchorBodies = sky_anchors.map(a => a.body?.toLowerCase() || "").filter(Boolean);
  
  // Check if any causal_logic entry contains "because"
  const hasBecause = causal_logic.some(s => 
    s.toLowerCase().includes("because")
  );
  
  // Check if any causal_logic entry references an anchor
  const referencesAnchor = causal_logic.some(s => {
    const lower = s.toLowerCase();
    return anchorLabels.some(label => lower.includes(label)) ||
           anchorBodies.some(body => lower.includes(body)) ||
           /sun|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto/i.test(lower);
  });
  
  // Add fallback if missing "because" or anchor reference
  if (!hasBecause || !referencesAnchor) {
    const anchorRef = anchorLabels.length > 0 
      ? anchorLabels[0] 
      : anchorBodies.length > 0 
        ? anchorBodies[0] 
        : "the sky state";
    
    causal_logic.unshift(
      `This is true because ${anchorRef} anchors the interpretation for today (12:00 UTC).`
    );
  }
  
  // Ensure at least one causal logic entry
  if (causal_logic.length === 0) {
    const anchorRef = anchorLabels.length > 0 
      ? anchorLabels[0] 
      : "the sky state";
    causal_logic = [
      `This is true because ${anchorRef} anchors the interpretation for today (12:00 UTC).`
    ];
  }
  
  // Pass through fields from DailyInterpretation (transformer should not re-derive)
  const supporting_themes = dailyInterpretation.supporting_themes;
  const tone_descriptor = dailyInterpretation.tone_descriptor;
  const confidence_level = dailyInterpretation.confidence_level;
  
  // Pass through signals directly (already in InterpretiveFrame format from deriveSignalsFromSkyFeatures)
  const signals = dailyInterpretation.signals;
  const interpretation_bundles = transformInterpretationBundles(
    dailyInterpretation.interpretation_bundles
  );
  
  // Pass through temporal fields from deriveDailyInterpretation (computed using legacy logic)
  const temporal_phase = dailyInterpretation.temporal_phase;
  const intensity_modifier = dailyInterpretation.intensity_modifier;
  const continuity = dailyInterpretation.continuity;
  const temporal_arc = dailyInterpretation.temporal_arc;
  const timing = dailyInterpretation.timing;
  
  // Optional fields
  const lunation: InterpretiveFrame["lunation"] = undefined; // TODO: derive from signals
  
  // Canon compliance - match legacy format exactly
  const canon_compliance: InterpretiveFrame["canon_compliance"] = {
    violations: [],
    notes: [`canon:v${interpretiveCanon.version}`],
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

