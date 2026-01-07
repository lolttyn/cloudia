/**
 * Phase 5.2 Step 3 — Derive DailyInterpretation from canonical inputs
 * 
 * Pure function that deterministically derives Layer 2 meaning from
 * Layer 0 (SkyStateDaily) + Layer 1 (DailyFacts) inputs.
 * 
 * This is DB-free and deterministic - all inputs come from InterpretationInputs.
 * Includes window logic for temporal fields (Phase 5.3).
 */

import { InterpretationInputs } from "./loadInterpretationInputs.js";
import {
  DailyInterpretationSchema,
  type DailyInterpretation,
} from "./schema/dailyInterpretation.schema.js";
import interpretiveCanon from "../../interpretation/canon/interpretiveCanon_v1.json" assert { type: "json" };
import type { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import type { InterpretationSignal } from "../../interpretation/signals/signals.schema.js";
import {
  sunInSignKey,
  moonInSignKey,
  moonPhaseKey,
  sunMoonAspectKey,
  moonIngressKey,
  sunIngressKey,
  newMoonKey,
  fullMoonKey,
  normalizeSign,
} from "../../interpretation/signals/signalKeys.js";
import { loadInterpretationBundles } from "../../interpretation/bundles/loadInterpretationBundles.js";
import { selectInterpretationBundles } from "../../interpretation/bundles/selectInterpretationBundles.js";
type InterpretiveCanon = typeof interpretiveCanon;

// Minimal SkyFeatures type for window logic (matches legacy)
type SkyFeatures = {
  date: string;
  sun: { sign: string };
  moon: { sign: string; phase: "new" | "waxing" | "full" | "waning" };
};

// Legacy SkyAspect type for aspect detection
type SkyAspect =
  | {
      type: "aspect";
      aspect: "conjunction" | "sextile" | "square" | "trine" | "opposition";
      orb_deg: number;
    }
  | {
      type: "ingress";
      body: "Moon" | "Sun";
      from_sign: string;
      to_sign: string;
      window: "past_24h" | "next_24h";
    };

type CanonSunSign = InterpretiveCanon["sun_signs"][string];
type CanonMoonSign = InterpretiveCanon["moon_signs"][string];
type CanonPhase = InterpretiveCanon["moon_phases"][keyof InterpretiveCanon["moon_phases"]];

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
 * Port legacy pickTone() function
 */
function pickTone(
  moonEntry: CanonMoonSign,
  phaseEntry: CanonPhase,
  aspect: SkyAspect | undefined,
  canon: InterpretiveCanon
): string {
  const parts = [moonEntry.tone];

  if (aspect?.type === "aspect") {
    const aspectTone = canon.aspects.sun_moon[aspect.aspect]?.tone;
    if (aspectTone) parts.push(aspectTone);
  }

  // Use the phase hint sparingly to keep tone bounded.
  if (phaseEntry.why_today.includes("peaks") && !parts.includes("illuminated")) {
    parts.push("illuminated");
  }

  return parts.filter(Boolean).join("; ");
}

/**
 * Port legacy buildCausalLogic() function
 */
function buildCausalLogic(
  sunSign: string,
  moonSign: string,
  sunEntry: CanonSunSign,
  moonEntry: CanonMoonSign,
  aspect: SkyAspect | undefined,
  canon: InterpretiveCanon
): string[] {
  const lines = [
    `Because the Moon is in ${moonSign}, ${moonEntry.core_meanings[0]} and ${moonEntry.core_meanings[1]} take precedence.`,
    `Because the Sun is in ${sunSign}, the day stays framed by ${sunEntry.core_meanings.join(" and ")}.`,
  ];

  if (aspect?.type === "aspect") {
    const aspectCanon = canon.aspects.sun_moon[aspect.aspect];
    if (aspectCanon) {
      lines.push(
        `Because the Sun and Moon form a ${aspect.aspect}, ${aspectCanon.meaning}.`
      );
    }
  }

  return lines;
}

/**
 * Helper: dedupe array
 */
function dedupe<T>(list: T[]): T[] {
  return Array.from(new Set(list));
}

/**
 * Helper: strip undefined fields from object (for meta objects)
 */
function compact<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Helper: build date window (yesterday/today/tomorrow)
 */
function buildDateWindow(base: string, lookback: number, lookahead: number): string[] {
  const baseDate = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime())) throw new Error(`Invalid date ${base}`);
  const dates: string[] = [];
  for (let i = lookback; i >= 1; i--) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  dates.push(base);
  for (let i = 1; i <= lookahead; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Port legacy deriveTemporalPhase() function
 */
function deriveTemporalPhase(today: SkyFeatures, window: SkyFeatures[]): InterpretiveFrame["temporal_phase"] {
  // Map coarse lunar phase to temporal phase with simple trend detection.
  const idx = window.findIndex((w) => w.date === today.date);
  if (idx === -1) {
    throw new Error("Temporal window missing today snapshot");
  }
  const phase = today.moon.phase;
  const yesterday = window[idx - 1];

  if (phase === "full") return "peak";
  if (phase === "waning") return yesterday?.moon.phase === "full" ? "aftershock" : "releasing";
  if (phase === "waxing") return "building";
  if (phase === "new") return "baseline";
  return "baseline";
}

/**
 * Port legacy deriveIntensityModifier() function
 */
function deriveIntensityModifier(
  axisStatement: string,
  temporal_phase: InterpretiveFrame["temporal_phase"],
  window: SkyFeatures[],
  baseDate: string
): InterpretiveFrame["intensity_modifier"] {
  const todayIdx = window.findIndex((w) => w.date === baseDate);
  if (todayIdx === -1) throw new Error("Temporal window missing today snapshot");
  const today = window[todayIdx];
  const yesterday = window[todayIdx - 1];

  const novelty =
    !yesterday || yesterday.moon.sign.toLowerCase() !== today.moon.sign.toLowerCase();

  if (novelty) {
    return temporal_phase === "peak" ? "dominant" : "emerging";
  }

  if (temporal_phase === "peak") return "dominant";
  if (temporal_phase === "building") return "strengthening";
  if (temporal_phase === "releasing" || temporal_phase === "aftershock") return "softening";
  return "emerging";
}

/**
 * Port legacy deriveTemporalArc() function
 */
function deriveTemporalArc(
  temporal_phase: InterpretiveFrame["temporal_phase"],
  intensity: InterpretiveFrame["intensity_modifier"],
  today: SkyFeatures,
  window: SkyFeatures[]
): InterpretiveFrame["temporal_arc"] {
  // Simple deterministic arc assignment based on available features.
  // Priority: lunar_phase (from Moon phase) -> solar_ingress (sun sign change in window) -> none.

  const idx = window.findIndex((w) => w.date === today.date);
  const yesterday = window[idx - 1];
  const tomorrow = window[idx + 1];

  // Detect lunar phase arc (short arc ~7 days)
  const phaseMap: Record<SkyFeatures["moon"]["phase"], { phase: string; arc_day_index: number }> =
    {
      new: { phase: "building", arc_day_index: 1 },
      waxing: { phase: "building", arc_day_index: 2 },
      full: { phase: "peak", arc_day_index: 4 },
      waning: { phase: "releasing", arc_day_index: 5 },
    };

  const lunarPhase = phaseMap[today.moon.phase];
  if (lunarPhase) {
    return {
      type: "lunar_phase",
      phase: lunarPhase.phase,
      intensity,
      arc_day_index: lunarPhase.arc_day_index,
      arc_total_days: 7,
    };
  }

  // Detect solar ingress (micro arc 3 days)
  const sunChange =
    (yesterday && yesterday.sun.sign !== today.sun.sign) ||
    (tomorrow && tomorrow.sun.sign !== today.sun.sign);
  if (sunChange) {
    return {
      type: "solar_ingress",
      phase: "ingress",
      intensity,
      arc_day_index: 1,
      arc_total_days: 3,
    };
  }

  return {
    type: "none",
    phase: "baseline",
    intensity: "emerging",
    arc_day_index: 1,
    arc_total_days: 1,
  };
}

/**
 * Port legacy buildContinuityHooks() function
 */
function buildContinuityHooks(
  temporal_phase: InterpretiveFrame["temporal_phase"],
  intensity: InterpretiveFrame["intensity_modifier"],
  window: SkyFeatures[],
  axisStatement: string,
  baseDate: string
): InterpretiveFrame["continuity"] {
  const todayIdx = window.findIndex((w) => w.date === baseDate);
  if (todayIdx === -1) throw new Error("Temporal window missing today snapshot");
  const yesterday = window[todayIdx - 1];
  const tomorrow = window[todayIdx + 1];
  const hooks: InterpretiveFrame["continuity"] = {};

  if (yesterday && temporal_phase !== "baseline") {
    hooks.references_yesterday = `Yesterday signaled ${axisStatement.toLowerCase()}; today it is ${intensity}.`;
  }

  if (tomorrow && (temporal_phase === "building" || temporal_phase === "peak")) {
    hooks.references_tomorrow = `Today sets the tone; tomorrow carries the echo of ${axisStatement.toLowerCase()}.`;
  }

  return hooks;
}

/**
 * Port legacy deriveSignalsFromSkyFeatures() function exactly
 */
function deriveSignalsFromSkyFeatures(
  features: SkyFeatures & { highlights: SkyAspect[] }
): InterpretationSignal[] {
  const signals: InterpretationSignal[] = [];
  const ORB_MAX = 6;
  const SIGNS = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ];

  function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function aspectSalience(orbDeg: number): number {
    return clamp01(1 - orbDeg / ORB_MAX);
  }

  function moonPhaseSalience(phase: SkyFeatures["moon"]["phase"]): number {
    if (phase === "new" || phase === "full") return 0.45;
    return 0.25;
  }

  function normalizeDeg(value: number) {
    let v = value % 360;
    if (v < 0) v += 360;
    return v;
  }

  function angularSeparation(a: number, b: number) {
    const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
    return Math.min(diff, 360 - diff);
  }

  function isOppositeSign(a: string, b: string): boolean {
    const ai = SIGNS.indexOf(a.toLowerCase());
    const bi = SIGNS.indexOf(b.toLowerCase());
    if (ai === -1 || bi === -1) return false;
    return (ai + 6) % 12 === bi;
  }

  function temporalLabelFromWindow(window: "past_24h" | "next_24h") {
    return window === "past_24h" ? "entering" : "exiting";
  }

  const moonIngressHighlight = features.highlights.find(
    (h) => h.type === "ingress" && h.body === "Moon"
  ) as Extract<SkyAspect, { type: "ingress"; body: "Moon" }> | undefined;
  
  const sunIngressHighlight = features.highlights.find(
    (h) => h.type === "ingress" && h.body === "Sun"
  ) as Extract<SkyAspect, { type: "ingress"; body: "Sun" }> | undefined;

  // Sun in sign
  // Always include temporal_window and temporal_label (legacy always includes them)
  signals.push({
    signal_key: sunInSignKey(features.sun.sign),
    kind: "planet_in_sign",
    salience: 0.35,
    source: "sky_features",
    meta: {
      sign: features.sun.sign.toLowerCase(),
      body: "sun",
      temporal_window: sunIngressHighlight?.window,
      temporal_label: sunIngressHighlight ? temporalLabelFromWindow(sunIngressHighlight.window) : undefined,
    },
  });

  // Moon in sign
  // Always include temporal_window and temporal_label (legacy always includes them)
  signals.push({
    signal_key: moonInSignKey(features.moon.sign),
    kind: "planet_in_sign",
    salience: 0.3,
    source: "sky_features",
    meta: {
      sign: features.moon.sign.toLowerCase(),
      body: "moon",
      phase: features.moon.phase,
      temporal_window: moonIngressHighlight?.window,
      temporal_label: moonIngressHighlight ? temporalLabelFromWindow(moonIngressHighlight.window) : undefined,
    },
  });

  // Moon phase
  signals.push({
    signal_key: moonPhaseKey(features.moon.phase),
    kind: "lunar_phase",
    salience: moonPhaseSalience(features.moon.phase),
    source: "sky_features",
    meta: compact({ phase: features.moon.phase }),
  });

  // Lunation detection: high-salience, single-dominant triggers.
  // Note: We need sun/moon longitudes for elongation, but we don't have them in SkyFeatures
  // For now, we'll use a simplified check - legacy uses elongation but we can approximate
  if (features.moon.phase === "new" && features.sun.sign === features.moon.sign) {
    signals.push({
      signal_key: newMoonKey(features.sun.sign),
      kind: "lunation",
      salience: 0.95,
      source: "sky_features",
      meta: compact({ sign: features.sun.sign.toLowerCase(), phase: "new" }),
    });
  } else if (features.moon.phase === "full" && isOppositeSign(features.sun.sign, features.moon.sign)) {
    signals.push({
      signal_key: fullMoonKey(features.moon.sign),
      kind: "lunation",
      salience: 0.95,
      source: "sky_features",
      meta: compact({ sign: features.moon.sign.toLowerCase(), phase: "full" }),
    });
  }

  for (const highlight of features.highlights) {
    if (highlight.type === "aspect") {
      // orb_deg is already rounded to 2 decimals in buildSkyFeaturesWithHighlights
      signals.push({
        signal_key: sunMoonAspectKey(highlight.aspect),
        kind: "aspect",
        salience: aspectSalience(highlight.orb_deg),
        source: "sky_features",
        orb_deg: highlight.orb_deg,
        meta: compact({ aspect: highlight.aspect, bodies: ["Sun", "Moon"] }),
      });
    } else if (highlight.type === "ingress") {
      signals.push({
        signal_key:
          highlight.body === "Sun"
            ? sunIngressKey(highlight.to_sign, highlight.window)
            : moonIngressKey(highlight.to_sign, highlight.window),
        kind: "ingress",
        salience: 0.2,
        source: "sky_features",
        meta: compact({
          body: highlight.body,
          from_sign: highlight.from_sign,
          to_sign: highlight.to_sign,
          window: highlight.window,
          temporal_window: highlight.window,
          temporal_label: temporalLabelFromWindow(highlight.window),
        }),
      });
    }
  }

  return signals.sort((a, b) => {
    if (b.salience !== a.salience) {
      return b.salience - a.salience;
    }
    return a.signal_key.localeCompare(b.signal_key);
  });
}

/**
 * Port legacy confidenceFrom() function - based on aspect orb, not transits
 */
function confidenceFrom(aspect: SkyAspect | undefined): "high" | "medium" | "low" {
  if (aspect?.type === "aspect") {
    if (aspect.orb_deg <= 2) return "high";
    if (aspect.orb_deg <= 4) return "medium";
    return "low";
  }
  return "medium";
}

/**
 * Helper: Map SkyState to SkyFeatures for window logic
 */
async function mapSkyStateToSkyFeatures(
  skyState: InterpretationInputs["sky_state"],
  date: string
): Promise<SkyFeatures> {
  // Map phase_name to legacy phase enum
  const phaseName = skyState.lunar?.phase_name;
  let legacyPhase: "new" | "waxing" | "full" | "waning" = "waxing";
  
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
  
  return {
    date,
    sun: { sign: skyState.bodies.sun?.sign || "" },
    moon: {
      sign: skyState.bodies.moon?.sign || "",
      phase: legacyPhase,
    },
  };
}

/**
 * Helper: Build SkyFeatures with highlights (aspects and ingresses) for signal derivation
 */
async function buildSkyFeaturesWithHighlights(
  todayState: InterpretationInputs["sky_state"],
  prevState: any,
  nextState: any,
  date: string
): Promise<SkyFeatures & { highlights: SkyAspect[] }> {
  const { computeSkyState } = await import("../../../astro/computeSkyState.js");
  
  // Helper to titlecase sign
  function titleCase(sign: string): string {
    return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
  }
  
  const todayMoonSign = titleCase(todayState.bodies.moon?.sign || "");
  const todaySunSign = titleCase(todayState.bodies.sun?.sign || "");
  const prevMoonSign = titleCase(prevState?.bodies?.moon?.sign || "");
  const nextMoonSign = titleCase(nextState?.bodies?.moon?.sign || "");
  const prevSunSign = titleCase(prevState?.bodies?.sun?.sign || "");
  const nextSunSign = titleCase(nextState?.bodies?.sun?.sign || "");
  
  const features = await mapSkyStateToSkyFeatures(todayState, date);
  const highlights: SkyAspect[] = [];
  
  // Detect Sun-Moon aspect
  const sunMoonAspect = todayState.aspects?.find(
    (a) => 
      (a.body_a === "sun" && a.body_b === "moon") ||
      (a.body_a === "moon" && a.body_b === "sun")
  );
  
  if (sunMoonAspect) {
    const aspectType = sunMoonAspect.type;
    if (
      aspectType === "conjunction" ||
      aspectType === "sextile" ||
      aspectType === "square" ||
      aspectType === "trine" ||
      aspectType === "opposition"
    ) {
      // Round orb to 2 decimals first (legacy behavior)
      const orbRounded = Number((sunMoonAspect.orb_deg || 0).toFixed(2));
      highlights.push({
        type: "aspect",
        aspect: aspectType,
        orb_deg: orbRounded,
      });
    }
  }
  
  // Detect Moon ingress
  if (prevMoonSign !== todayMoonSign) {
    highlights.push({
      type: "ingress",
      body: "Moon",
      from_sign: prevMoonSign,
      to_sign: todayMoonSign,
      window: "past_24h",
    });
  } else if (nextMoonSign !== todayMoonSign) {
    highlights.push({
      type: "ingress",
      body: "Moon",
      from_sign: todayMoonSign,
      to_sign: nextMoonSign,
      window: "next_24h",
    });
  }
  
  // Detect Sun ingress (only if no Moon ingress)
  if (highlights.find(h => h.type === "ingress" && h.body === "Moon") === undefined) {
    if (prevSunSign !== todaySunSign) {
      highlights.push({
        type: "ingress",
        body: "Sun",
        from_sign: prevSunSign,
        to_sign: todaySunSign,
        window: "past_24h",
      });
    } else if (nextSunSign !== todaySunSign) {
      highlights.push({
        type: "ingress",
        body: "Sun",
        from_sign: todaySunSign,
        to_sign: nextSunSign,
        window: "next_24h",
      });
    }
  }
  
  return { ...features, highlights };
}

/**
 * Helper: Detect Sun-Moon aspect from sky state
 */
function detectSunMoonAspect(
  skyState: InterpretationInputs["sky_state"]
): SkyAspect | undefined {
  const sunMoonAspect = skyState.aspects?.find(
    (a) => 
      (a.body_a === "sun" && a.body_b === "moon") ||
      (a.body_a === "moon" && a.body_b === "sun")
  );
  
  if (!sunMoonAspect) return undefined;
  
  // Map aspect type to legacy format
  const aspectType = sunMoonAspect.type;
  if (
    aspectType === "conjunction" ||
    aspectType === "sextile" ||
    aspectType === "square" ||
    aspectType === "trine" ||
    aspectType === "opposition"
  ) {
    return {
      type: "aspect",
      aspect: aspectType,
      orb_deg: sunMoonAspect.orb_deg || 0,
    };
  }
  
  return undefined;
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
  const { computeSkyState } = await import("../../../astro/computeSkyState.js");
  
  // Helper to titlecase sign
  function titleCase(sign: string): string {
    return sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
  }
  
  // Get moon and sun signs (titlecase for canon lookup)
  const moonSignRaw = sky_state.bodies.moon?.sign;
  const sunSignRaw = sky_state.bodies.sun?.sign;
  const moonSign = moonSignRaw 
    ? titleCase(moonSignRaw)
    : null;
  const sunSign = sunSignRaw
    ? titleCase(sunSignRaw)
    : null;
  
  if (!moonSign || !sunSign) {
    throw new Error("Missing moon or sun sign in sky state");
  }
  
  // Load canon entries
  const moonEntry = interpretiveCanon.moon_signs[moonSign];
  const sunEntry = interpretiveCanon.sun_signs[sunSign];
  
  if (!moonEntry) {
    throw new Error(`No canon entry for Moon in ${moonSign}`);
  }
  if (!sunEntry) {
    throw new Error(`No canon entry for Sun in ${sunSign}`);
  }
  
  // Map phase_name to legacy phase enum (reuse helper logic)
  const todayFeatures = await mapSkyStateToSkyFeatures(sky_state, timestamp.date);
  const legacyPhase = todayFeatures.moon.phase;
  
  const phaseEntry = interpretiveCanon.moon_phases[legacyPhase];
  if (!phaseEntry) {
    throw new Error(`No canon entry for lunar phase ${legacyPhase}`);
  }
  
  // Detect Sun-Moon aspect
  const aspect = detectSunMoonAspect(sky_state);
  
  // Derive core meaning fields using legacy functions
  const dominant_contrast_axis = deriveDominantAxis(inputs, interpretiveCanon);
  const { why_today, why_today_clause } = await deriveWhyToday(inputs, interpretiveCanon);
  const sky_anchors = deriveSkyAnchors(inputs);
  
  // Port legacy pickTone()
  const tone_descriptor = pickTone(moonEntry, phaseEntry, aspect, interpretiveCanon);
  
  // Port legacy buildCausalLogic()
  const causal_logic = buildCausalLogic(
    sunSign,
    moonSign,
    sunEntry,
    moonEntry,
    aspect,
    interpretiveCanon
  );
  
  // Port legacy supporting_themes logic
  const supporting_themes = dedupe([
    ...moonEntry.supporting_themes,
    ...(sunEntry.modulates ?? []),
  ]).slice(0, 8);
  
  // Build window for temporal logic (yesterday/today/tomorrow)
  const windowDates = buildDateWindow(timestamp.date, 1, 1);
  const windowSkyStates = await Promise.all(
    windowDates.map((d) => computeSkyState({ date: d, timezone: "UTC" }))
  );
  const windowFeatures = await Promise.all(
    windowSkyStates.map((state, idx) => mapSkyStateToSkyFeatures(state, windowDates[idx]))
  );
  
  // todayFeatures already computed above
  
  // Derive temporal fields using legacy functions
  const temporal_phase = deriveTemporalPhase(todayFeatures, windowFeatures);
  const intensity_modifier = deriveIntensityModifier(
    dominant_contrast_axis.statement,
    temporal_phase,
    windowFeatures,
    timestamp.date
  );
  const temporal_arc = deriveTemporalArc(
    temporal_phase,
    intensity_modifier,
    todayFeatures,
    windowFeatures
  );
  const continuity = buildContinuityHooks(
    temporal_phase,
    intensity_modifier,
    windowFeatures,
    dominant_contrast_axis.statement,
    timestamp.date
  );
  
  // Port legacy timing.notes logic
  const timingNotes = aspect?.type === "aspect"
    ? `Sun-Moon ${aspect.aspect} with ${(aspect.orb_deg || 0).toFixed(2)}° orb`
    : `Lunar phase pacing: ${legacyPhase}`;
  
  // Port legacy deriveSignalsFromSkyFeatures() - build features with highlights
  const prevState = windowSkyStates[0]; // yesterday
  const nextState = windowSkyStates[2]; // tomorrow
  const featuresWithHighlights = await buildSkyFeaturesWithHighlights(
    sky_state,
    prevState,
    nextState,
    timestamp.date
  );
  const signals = deriveSignalsFromSkyFeatures(featuresWithHighlights);
  
  // Port legacy bundle selection - output refs only (production shape)
  const bundleIndex = loadInterpretationBundles();
  const bundleSelection = selectInterpretationBundles({
    signals,
    bundleIndex,
  });
  
  // Convert full bundles to refs (production shape: refs only)
  const interpretation_bundles = {
    primary: bundleSelection.primary.map(bundle => ({
      bundle_slug: bundle.slug,
      salience_class: "primary" as const,
    })),
    secondary: bundleSelection.secondary.map(bundle => ({
      bundle_slug: bundle.slug,
      salience_class: "secondary" as const,
    })),
    suppressed: bundleSelection.suppressed,
  };
  
  // Port legacy confidenceFrom() - based on aspect orb
  const confidence_level = confidenceFrom(aspect);
  
  // Map phaseEntry.timing_state to InterpretiveFrame timing.state enum
  // Canon values: "building", "peaking", "settling" - all map directly
  const timingState = (phaseEntry.timing_state === "building" ? "building"
    : phaseEntry.timing_state === "peaking" ? "peaking"
    : phaseEntry.timing_state === "settling" ? "settling"
    : "building") as "building" | "peaking" | "settling" | "transitioning";
  
  const dailyInterpretation = DailyInterpretationSchema.parse({
    schema_version: "1.0.0",
    date: timestamp.date,
    dominant_contrast_axis,
    why_today,
    why_today_clause,
    sky_anchors,
    causal_logic,
    supporting_themes,
    tone_descriptor,
    signals,
    interpretation_bundles,
    confidence_level,
    temporal_phase,
    intensity_modifier,
    temporal_arc,
    continuity,
    timing: {
      state: timingState,
      notes: timingNotes,
    },
    provenance: {
      sky_state_date: timestamp.date,
      sky_state_version: meta?.sky_state_version,
      daily_facts_date: timestamp.date,
      daily_facts_policy_version: meta?.daily_facts_policy_version,
    },
  });
  
  return dailyInterpretation;
}

