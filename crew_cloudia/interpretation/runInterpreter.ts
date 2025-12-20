import interpretiveCanon from "./canon/interpretiveCanon_v1.json" assert { type: "json" };
import { loadInterpretationBundles } from "./bundles/loadInterpretationBundles.js";
import { selectInterpretationBundles } from "./bundles/selectInterpretationBundles.js";
import { deriveSignalsFromSkyFeatures } from "./signals/deriveSignalsFromSkyFeatures.js";
import { extractSkyFeatures, SkyFeatures, SkyAspect } from "./sky/extractSkyFeatures.js";
import { InterpretiveFrame, InterpretiveFrameSchema } from "./schema/InterpretiveFrame.js";
import { normalizeSign } from "./signals/signalKeys.js";
import { InterpretationSignal } from "./signals/signals.schema.js";

const INGRESS_SENSITIVE_BODIES = ["Moon", "Sun"] as const;

type InterpretiveCanon = typeof interpretiveCanon;

type InterpreterInput = {
  date: string; // YYYY-MM-DD
  lookback_days?: number;
  lookahead_days?: number;
  canon?: InterpretiveCanon;
  features?: SkyFeatures;
};

type CanonSunSign = InterpretiveCanon["sun_signs"][string];
type CanonMoonSign = InterpretiveCanon["moon_signs"][string];
type CanonPhase = InterpretiveCanon["moon_phases"][keyof InterpretiveCanon["moon_phases"]];

const BUNDLE_INDEX = loadInterpretationBundles();

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}`);
  }
}

function ensureAxisAllowed(axis: { statement: string; primary: string; counter: string }, canon: InterpretiveCanon) {
  if (!canon.allowed_axes.includes(axis.statement)) {
    throw new Error(`Axis '${axis.statement}' is not permitted by canon v${canon.version}`);
  }
}

function pickAxis(moonEntry: CanonMoonSign, canon: InterpretiveCanon) {
  const axis = moonEntry.dominant_axis;
  ensureAxisAllowed(axis, canon);
  return axis;
}

function pickTone(
  moonEntry: CanonMoonSign,
  phaseEntry: CanonPhase,
  aspect: SkyAspect | undefined,
  canon: InterpretiveCanon
) {
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

function buildAnchors(
  sunSign: string,
  moonSign: string,
  sunEntry: CanonSunSign,
  moonEntry: CanonMoonSign
): InterpretiveFrame["sky_anchors"] {
  // Always emit static anchors for ingress-sensitive bodies (Moon and Sun)
  return [
    {
      type: "moon_sign",
      label: `Moon in ${moonSign}`,
      meaning: moonEntry.core_meanings.join(", "),
    },
    {
      type: "sun_sign",
      label: `Sun in ${sunSign}`,
      meaning: sunEntry.core_meanings.join(", "),
    },
  ];
}

function buildCausalLogic(
  sunSign: string,
  moonSign: string,
  sunEntry: CanonSunSign,
  moonEntry: CanonMoonSign,
  aspect: SkyAspect | undefined,
  canon: InterpretiveCanon
) {
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

function pickWhyToday(
  features: SkyFeatures,
  moonEntry: CanonMoonSign,
  phaseEntry: CanonPhase,
  aspect: SkyAspect | undefined,
  templates: InterpretiveCanon["why_today_templates"]
) {
  const reasons: string[] = [];

  const ingress = features.highlights.find(
    (h) => h.type === "ingress" && INGRESS_SENSITIVE_BODIES.includes(h.body)
  );

  if (ingress?.type === "ingress") {
    const bodyLabel = ingress.body;
    const currentSign = bodyLabel === "Moon" ? features.moon.sign : features.sun.sign;

    if (ingress.window === "next_24h" && ingress.to_sign !== currentSign) {
      reasons.push(
        `The ${bodyLabel} is in ${currentSign} today and enters ${ingress.to_sign} within the next 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    } else {
      reasons.push(
        `The ${bodyLabel} is in ${currentSign} today after entering from ${ingress.from_sign} within the past 24 hours, emphasizing ${moonEntry.core_meanings[0]}.`
      );
    }
    reasons.push(templates.ingress);
  } else if (aspect?.type === "aspect") {
    reasons.push(
      `Today the Sun and Moon perfect a ${aspect.aspect}, so ${moonEntry.dominant_axis.primary} outweighs ${moonEntry.dominant_axis.counter}.`
    );
    reasons.push(templates.aspect);
  } else {
    reasons.push(phaseEntry.why_today);
    reasons.push(templates.phase);
  }

  return {
    why_today: reasons.slice(0, 4),
    why_today_clause: reasons[0],
  };
}

function dedupe<T>(list: T[]): T[] {
  return Array.from(new Set(list));
}

function confidenceFrom(aspect: SkyAspect | undefined): InterpretiveFrame["confidence_level"] {
  if (aspect?.type === "aspect") {
    if (aspect.orb_deg <= 2) return "high";
    if (aspect.orb_deg <= 4) return "medium";
    return "low";
  }
  return "medium";
}

function resolveLunation(
  signals: InterpretationSignal[],
  primaryBundles: { trigger: { signal_key: string } }[]
): InterpretiveFrame["lunation"] | undefined {
  const lunationSignals = signals
    .filter((s) => s.kind === "lunation")
    .sort((a, b) => {
      if (b.salience !== a.salience) return b.salience - a.salience;
      return a.signal_key.localeCompare(b.signal_key);
    });

  if (lunationSignals.length === 0) return undefined;

  const chosenSignal = lunationSignals[0];
  const primary = primaryBundles[0];
  if (!primary || primary.trigger.signal_key !== chosenSignal.signal_key) {
    return undefined;
  }

  const meta = chosenSignal.meta && typeof chosenSignal.meta === "object" ? (chosenSignal.meta as any) : null;

  const fromSignalKey = () => {
    if (chosenSignal.signal_key.startsWith("new_moon_in_")) {
      return {
        kind: "new" as const,
        sign: normalizeSign(chosenSignal.signal_key.replace("new_moon_in_", "")),
      };
    }
    if (chosenSignal.signal_key.startsWith("full_moon_in_")) {
      return {
        kind: "full" as const,
        sign: normalizeSign(chosenSignal.signal_key.replace("full_moon_in_", "")),
      };
    }
    return null;
  };

  const derived =
    meta && (meta.phase || meta.sign)
      ? {
          kind: String(meta.phase).toLowerCase() === "full" ? ("full" as const) : ("new" as const),
          sign: normalizeSign(String(meta.sign ?? "")),
        }
      : fromSignalKey();

  if (!derived || !derived.sign) return undefined;

  return {
    kind: derived.kind,
    sign: derived.sign,
    signal_key: chosenSignal.signal_key,
  };
}

export async function runInterpreter(input: InterpreterInput): Promise<InterpretiveFrame> {
  validateDate(input.date);

  const canon = input.canon ?? interpretiveCanon;
  const lookback = input.lookback_days ?? 3;
  const lookahead = input.lookahead_days ?? 2;

  const features = input.features ?? (await extractSkyFeatures({ date: input.date }));
  const windowDates = buildDateWindow(input.date, lookback, lookahead);
  const windowFeatures = await Promise.all(
    windowDates.map((d) =>
      d === input.date && input.features ? Promise.resolve(input.features) : extractSkyFeatures({ date: d })
    )
  );

  if (features.date !== input.date) {
    throw new Error(`Sky feature snapshot date mismatch: expected ${input.date}, got ${features.date}`);
  }

  const sunEntry = canon.sun_signs[features.sun.sign];
  if (!sunEntry) {
    throw new Error(`No canon entry for Sun in ${features.sun.sign}`);
  }

  const moonEntry = canon.moon_signs[features.moon.sign];
  if (!moonEntry) {
    throw new Error(`No canon entry for Moon in ${features.moon.sign}`);
  }

  const phaseEntry = canon.moon_phases[features.moon.phase];
  if (!phaseEntry) {
    throw new Error(`No canon entry for lunar phase ${features.moon.phase}`);
  }

  const aspect = features.highlights.find((h) => h.type === "aspect");
  const axis = pickAxis(moonEntry, canon);
  const tone_descriptor = pickTone(moonEntry, phaseEntry, aspect, canon);
  const anchors = buildAnchors(features.sun.sign, features.moon.sign, sunEntry, moonEntry);
  const causal_logic = buildCausalLogic(
    features.sun.sign,
    features.moon.sign,
    sunEntry,
    moonEntry,
    aspect,
    canon
  );

  const supportingThemes = dedupe([
    ...moonEntry.supporting_themes,
    ...(sunEntry.modulates ?? []),
  ]).slice(0, 8);

  const timingNotes = aspect?.type === "aspect"
    ? `Sun-Moon ${aspect.aspect} with ${aspect.orb_deg}° orb`
    : `Lunar phase pacing: ${features.moon.phase}`;

  const { why_today, why_today_clause } = pickWhyToday(
    features,
    moonEntry,
    phaseEntry,
    aspect,
    canon.why_today_templates
  );

  const temporal_phase = deriveTemporalPhase(features, windowFeatures);
  const intensity_modifier = deriveIntensityModifier(
    axis.statement,
    temporal_phase,
    windowFeatures,
    input.date
  );
  const continuity = buildContinuityHooks(
    temporal_phase,
    intensity_modifier,
    windowFeatures,
    axis.statement,
    input.date
  );

  const signals = deriveSignalsFromSkyFeatures(features);
  const interpretation_bundles = selectInterpretationBundles({
    signals,
    bundleIndex: BUNDLE_INDEX,
  });
  const lunation = resolveLunation(signals, interpretation_bundles.primary);

  const frame: InterpretiveFrame = {
    date: features.date,
    dominant_contrast_axis: axis,
    tone_descriptor,
    why_today,
    supporting_themes: supportingThemes,
    sky_anchors: anchors,
    causal_logic,
    why_today_clause,
    temporal_phase,
    intensity_modifier,
    continuity,
    temporal_arc: deriveTemporalArc(temporal_phase, intensity_modifier, features, windowFeatures),
    timing: { state: phaseEntry.timing_state, notes: timingNotes },
    signals,
    interpretation_bundles,
    confidence_level: confidenceFrom(aspect),
    canon_compliance: {
      violations: [],
      notes: [`canon:v${canon.version}`],
    },
    ...(lunation ? { lunation } : {}),
  };

  return InterpretiveFrameSchema.parse(frame);
}

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

