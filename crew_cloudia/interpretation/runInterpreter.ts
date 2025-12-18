import interpretiveCanon from "./canon/interpretiveCanon_v1.json" assert { type: "json" };
import { extractSkyFeatures, SkyFeatures, SkyAspect } from "./sky/extractSkyFeatures.js";
import { InterpretiveFrame, InterpretiveFrameSchema } from "./schema/InterpretiveFrame.js";

type InterpretiveCanon = typeof interpretiveCanon;

type InterpreterInput = {
  date: string; // YYYY-MM-DD
  canon?: InterpretiveCanon;
  features?: SkyFeatures;
};

type CanonSunSign = InterpretiveCanon["sun_signs"][string];
type CanonMoonSign = InterpretiveCanon["moon_signs"][string];
type CanonPhase = InterpretiveCanon["moon_phases"][keyof InterpretiveCanon["moon_phases"]];

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

  const ingress = features.highlights.find((h) => h.type === "ingress");
  if (ingress?.type === "ingress") {
    reasons.push(
      `Today the Moon enters ${ingress.to_sign}, a brief shift that highlights ${moonEntry.core_meanings[0]}.`
    );
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

export async function runInterpreter(input: InterpreterInput): Promise<InterpretiveFrame> {
  validateDate(input.date);

  const canon = input.canon ?? interpretiveCanon;
  const features = input.features ?? (await extractSkyFeatures({ date: input.date }));

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

  const frame: InterpretiveFrame = {
    date: features.date,
    dominant_contrast_axis: axis,
    tone_descriptor,
    why_today,
    supporting_themes: supportingThemes,
    sky_anchors: anchors,
    causal_logic,
    why_today_clause,
    timing: { state: phaseEntry.timing_state, notes: timingNotes },
    confidence_level: confidenceFrom(aspect),
    canon_compliance: {
      violations: [],
      notes: [`canon:v${canon.version}`],
    },
  };

  return InterpretiveFrameSchema.parse(frame);
}

