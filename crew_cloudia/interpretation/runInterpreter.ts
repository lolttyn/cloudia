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
    dominant_axis: { x: "integration", y: "momentum" },
    tone_descriptor: "quiet but deliberate",
    why_today: [
      "pressure is easing while discernment increases",
      "good for syncing inner motives with outer commitments",
    ],
    supporting_themes: ["discernment", "alignment", "settling"],
    sky_anchors: [
      { type: "sun_sign", label: "Sun in Capricorn", meaning: "structure + consolidation" },
      { type: "moon_sign", label: "Moon in Virgo", meaning: "discernment + refinement" },
    ],
    timing: { state: "settling", notes: "post-peak integration window" },
    confidence_level: "high",
    canon_compliance: { violations: [], notes: [] },
  };

  return InterpretiveFrameSchema.parse(frame);
}

