import { InterpretiveFrame, InterpretiveFrameSchema } from "./schema/InterpretiveFrame.js";

type InterpreterInput = {
  date: string; // YYYY-MM-DD
  // Future: ephemeris facts, canon version, etc.
};

export async function runInterpreter(input: InterpreterInput): Promise<InterpretiveFrame> {
  if (input.date !== "2025-12-18") {
    throw new Error(`Stub interpreter only supports 2025-12-18, got ${input.date}`);
  }

  const frame: InterpretiveFrame = {
    date: "2025-12-18",
    dominant_contrast_axis: {
      statement: "integration over momentum",
      primary: "integration",
      counter: "momentum",
    },
    tone_descriptor: "measured and discerning",
    why_today: [
      "brief Virgo Moon transit sharpens alignment today",
      "short window favors integration before momentum resumes",
    ],
    supporting_themes: [
      "noticing misalignments before pressing forward",
      "pausing to recalibrate",
    ],
    sky_anchors: [
      { type: "moon_sign", label: "Moon in Virgo", meaning: "refinement and calibration" },
      {
        type: "sun_sign",
        label: "Sun in Sagittarius",
        meaning: "direction and broad meaning",
      },
    ],
    causal_logic: [
      "Because the Moon is in Virgo, attention shifts to alignment and fine-tuning before pressing ahead.",
      "Because the Sun remains in Sagittarius, the drive for direction stays present but yields to integration.",
    ],
    why_today_clause: "Today is a brief Virgo Moon window to integrate before momentum returns.",
    timing: { state: "settling", notes: "short integration window before momentum resumes" },
    confidence_level: "medium",
    canon_compliance: { violations: [], notes: [] },
  };

  return InterpretiveFrameSchema.parse(frame);
}

