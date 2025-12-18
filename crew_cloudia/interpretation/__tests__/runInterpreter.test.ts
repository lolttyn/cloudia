import { describe, expect, it } from "vitest";
import { runInterpreter } from "../runInterpreter.js";
import { InterpretiveFrameSchema } from "../schema/InterpretiveFrame.js";

describe("runInterpreter (stub)", () => {
  it("returns a schema-valid frame for 2025-12-18", async () => {
    const frame = await runInterpreter({ date: "2025-12-18" });

    expect(() => InterpretiveFrameSchema.parse(frame)).not.toThrow();
    expect(frame.date).toBe("2025-12-18");
    expect(frame.sky_anchors.length).toBeGreaterThanOrEqual(1);
    expect(frame.dominant_contrast_axis.statement).toMatch(/ over /i);
  });

  it("throws for unsupported dates", async () => {
    await expect(runInterpreter({ date: "2025-12-19" })).rejects.toThrow();
  });

  it("fails schema when contrast axis is missing contrast", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: { statement: "integration", primary: "integration", counter: "momentum" },
      tone_descriptor: "calm",
      why_today: ["generic theme"],
      supporting_themes: [],
      sky_anchors: [
        { type: "sun_sign", label: "Sun in Capricorn", meaning: "structure" },
      ],
      causal_logic: ["because reasons"],
      why_today_clause: "today",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when sky anchors are missing", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: { statement: "integration over momentum", primary: "integration", counter: "momentum" },
      tone_descriptor: "calm",
      why_today: ["because today"],
      supporting_themes: [],
      sky_anchors: [],
      causal_logic: ["because reasons"],
      why_today_clause: "today",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });
});

