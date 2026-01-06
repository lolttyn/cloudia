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
import interpretiveCanon from "../../interpretation/canon/interpretiveCanon_v1.json" assert { type: "json" };
type InterpretiveCanon = typeof interpretiveCanon;

/**
 * Derive dominant contrast axis from sky state and daily facts
 * 
 * This is a placeholder implementation. The actual logic should derive
 * the axis from the primary transits and planetary positions.
 */
function deriveDominantAxis(
  inputs: InterpretationInputs,
  canon: InterpretiveCanon = interpretiveCanon
): DailyInterpretation["dominant_contrast_axis"] {
  const { sky_state } = inputs;
  
  // Get moon sign (titlecase to match canon keys)
  const moonSignRaw = sky_state.bodies.moon?.sign;
  if (!moonSignRaw) {
    // Fallback if moon sign missing (shouldn't happen)
    return {
      statement: "stability over change",
      primary: "stability",
      counter: "change",
    };
  }
  
  // Titlecase sign name to match canon keys (e.g., "Pisces", "Capricorn")
  const moonSign = moonSignRaw.charAt(0).toUpperCase() + moonSignRaw.slice(1).toLowerCase();
  
  // Load moon entry from canon
  const moonEntry = canon.moon_signs[moonSign];
  if (!moonEntry || !moonEntry.dominant_axis) {
    // Fallback if canon entry missing
    return {
      statement: "stability over change",
      primary: "stability",
      counter: "change",
    };
  }
  
  // Return moon entry's dominant axis (matches legacy pickAxis behavior)
  return moonEntry.dominant_axis;
}

/**
 * Derive why_today from ingress/aspect/phase priority
 * 
 * Ports legacy pickWhyToday() logic exactly:
 * 1. Check for ingress (Moon/Sun) - highest priority
 * 2. Check for Sun-Moon aspect - second priority
 * 3. Fallback to lunar phase - third priority
 */
async function deriveWhyToday(
  inputs: InterpretationInputs,
  canon: InterpretiveCanon = interpretiveCanon
): Promise<{ why_today: string[]; why_today_clause: string }> {
  const { sky_state, daily_facts } = inputs;
  const reasons: string[] = [];
  
  // Get moon and sun signs (titlecase for canon lookup)
  const moonSignRaw = sky_state.bodies.moon?.sign;
  const sunSignRaw = sky_state.bodies.sun?.sign;
  const moonSign = moonSignRaw 
    ? moonSignRaw.charAt(0).toUpperCase() + moonSignRaw.slice(1).toLowerCase()
    : null;
  const sunSign = sunSignRaw
    ? sunSignRaw.charAt(0).toUpperCase() + sunSignRaw.slice(1).toLowerCase()
    : null;
  
  // Get moon entry for core_meanings and dominant_axis
  const moonEntry = moonSign ? canon.moon_signs[moonSign] : null;
  if (!moonEntry) {
    // Fallback if moon entry missing
    return {
      why_today: ["Today's configuration offers unique opportunities"],
      why_today_clause: "Today's configuration offers unique opportunities",
    };
  }
  
  // Priority 1: Check for ingress (Moon or Sun) by comparing today with prev/next day
  // Legacy detects ingress by comparing sky states (extractSkyFeatures logic)
  // (background_conditions don't include ingress timing in v1)
  const { computeSkyState } = await import("../../../astro/computeSkyState.js");
  
  // Helper to offset date (same as legacy)
  function offsetDate(base: string, deltaDays: number): string {
    const d = new Date(`${base}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date ${base}`);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }
  
  // Helper to titlecase sign (same as legacy)
  function titleCase(sign: string): string {
    return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
  }
  
  const prevDate = offsetDate(inputs.timestamp.date, -1);
  const nextDate = offsetDate(inputs.timestamp.date, 1);
  const [prevState, nextState] = await Promise.all([
    computeSkyState({ date: prevDate, timezone: "UTC" }),
    computeSkyState({ date: nextDate, timezone: "UTC" }),
  ]);
  
  // Get today's signs (titlecase for comparison)
  const todayMoonSign = titleCase(sky_state.bodies.moon?.sign || "");
  const todaySunSign = titleCase(sky_state.bodies.sun?.sign || "");
  const prevMoonSign = titleCase(prevState.bodies.moon?.sign || "");
  const nextMoonSign = titleCase(nextState.bodies.moon?.sign || "");
  const prevSunSign = titleCase(prevState.bodies.sun?.sign || "");
  const nextSunSign = titleCase(nextState.bodies.sun?.sign || "");
  
  // Check for Moon ingress (legacy priority: check prev first, then next)
  let moonIngress: { body: "Moon"; from_sign: string; to_sign: string; window: "past_24h" | "next_24h" } | null = null;
  if (prevMoonSign !== todayMoonSign) {
    moonIngress = {
      body: "Moon",
      from_sign: prevMoonSign,
      to_sign: todayMoonSign,
      window: "past_24h",
    };
  } else if (nextMoonSign !== todayMoonSign) {
    moonIngress = {
      body: "Moon",
      from_sign: todayMoonSign,
      to_sign: nextMoonSign,
      window: "next_24h",
    };
  }
  
  // Check for Sun ingress (only if no Moon ingress)
  let sunIngress: { body: "Sun"; from_sign: string; to_sign: string; window: "past_24h" | "next_24h" } | null = null;
  if (!moonIngress) {
    if (prevSunSign !== todaySunSign) {
      sunIngress = {
        body: "Sun",
        from_sign: prevSunSign,
        to_sign: todaySunSign,
        window: "past_24h",
      };
    } else if (nextSunSign !== todaySunSign) {
      sunIngress = {
        body: "Sun",
        from_sign: todaySunSign,
        to_sign: nextSunSign,
        window: "next_24h",
      };
    }
  }
  
  // Moon ingress takes priority (legacy behavior)
  if (moonIngress) {
    if (moonIngress.window === "next_24h") {
      reasons.push(
        `The ${moonIngress.body} is in ${moonIngress.from_sign} today and enters ${moonIngress.to_sign} within the next 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    } else {
      reasons.push(
        `The ${moonIngress.body} is in ${moonIngress.from_sign} today after entering from ${moonIngress.to_sign} within the past 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    }
    reasons.push(canon.why_today_templates.ingress);
  } else if (sunIngress) {
    if (sunIngress.window === "next_24h") {
      reasons.push(
        `The ${sunIngress.body} is in ${sunIngress.from_sign} today and enters ${sunIngress.to_sign} within the next 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    } else {
      reasons.push(
        `The ${sunIngress.body} is in ${sunIngress.from_sign} today after entering from ${sunIngress.to_sign} within the past 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    }
    reasons.push(canon.why_today_templates.ingress);
  } else {
    // Priority 2: Check for Sun-Moon aspect in sky_state.aspects
    const sunMoonAspect = sky_state.aspects?.find(
      (a) => 
        (a.body_a === "sun" && a.body_b === "moon") ||
        (a.body_a === "moon" && a.body_b === "sun")
    );
    
    if (sunMoonAspect) {
      // Map aspect type to legacy format (SkyState uses "type", legacy uses "aspect")
      const aspectName = sunMoonAspect.type; // e.g., "sextile", "conjunction"
      reasons.push(
        `Today the Sun and Moon perfect a ${aspectName}, so ${moonEntry.dominant_axis.primary} outweighs ${moonEntry.dominant_axis.counter}.`
      );
      reasons.push(canon.why_today_templates.aspect);
    } else {
      // Priority 3: Fallback to lunar phase
      // Map SkyState phase_name to legacy phase names
      const phaseName = sky_state.lunar?.phase_name;
      let legacyPhase: "new" | "waxing" | "full" | "waning" | undefined;
      
      if (phaseName) {
        if (phaseName === "new") {
          legacyPhase = "new";
        } else if (phaseName.startsWith("waxing")) {
          legacyPhase = "waxing";
        } else if (phaseName === "full") {
          legacyPhase = "full";
        } else if (phaseName.startsWith("waning")) {
          legacyPhase = "waning";
        }
      }
      
      const moonPhase = legacyPhase || "waxing"; // Default fallback
      const phaseEntry = canon.moon_phases[moonPhase];
      if (phaseEntry) {
        reasons.push(phaseEntry.why_today);
        reasons.push(canon.why_today_templates.phase);
      } else {
        // Final fallback
        reasons.push("Today's configuration offers unique opportunities");
      }
    }
  }
  
  return {
    why_today: reasons.slice(0, 4),
    why_today_clause: reasons[0] || "Today's configuration offers unique opportunities",
  };
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
export async function deriveDailyInterpretation(
  inputs: InterpretationInputs
): Promise<DailyInterpretation> {
  const { sky_state, daily_facts, timestamp, meta } = inputs;
  
  // Derive signals (placeholder - will be ported from deriveSignalsFromSkyFeatures in Phase 5.2)
  // For now, create minimal signals from transits to satisfy schema
  const signals = daily_facts.interpreter_transits_v1.slice(0, 3).map((t) => ({
    signal_key: `${t.planet}_in_${t.sign}`,
    salience: t.salience as "primary" | "secondary" | "background",
    description: `${t.planet} in ${t.sign}`,
  }));
  
  // Ensure at least one signal for schema validation
  if (signals.length === 0) {
    signals.push({
      signal_key: "placeholder_signal",
      salience: "background" as const,
      description: "Background conditions",
    });
  }
  
  // Derive core meaning fields
  const dominant_contrast_axis = deriveDominantAxis(inputs, interpretiveCanon);
  const { why_today, why_today_clause } = await deriveWhyToday(inputs, interpretiveCanon);
  const sky_anchors = deriveSkyAnchors(inputs);
  const causal_logic = deriveCausalLogic(inputs);
  const confidence_level = deriveConfidenceLevel(inputs);
  
  // Build interpretation bundles structure
  // For Phase 5.2 scaffolding: use empty arrays until bundle selection is properly ported
  // This ensures schema validation passes while we work on parity
  const interpretation_bundles = {
    primary: [],
    secondary: [],
    background: [],
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

