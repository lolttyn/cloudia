import { describe, expect, it } from "vitest";
import { runInterpreter } from "../runInterpreter.js";
import { InterpretiveFrameSchema } from "../schema/InterpretiveFrame.js";

describe("runInterpreter (stub)", () => {
  it("returns a schema-valid frame for 2025-12-18 with explicit anchors and causality", async () => {
    const frame = await runInterpreter({ date: "2025-12-18" });

    expect(() => InterpretiveFrameSchema.parse(frame)).not.toThrow();
    expect(frame.date).toBe("2025-12-18");
    expect(frame.dominant_contrast_axis.statement).toMatch(/integration over momentum/i);
    expect(frame.sky_anchors.map((a) => a.label)).toEqual(
      expect.arrayContaining(["Moon in Virgo", "Sun in Sagittarius"])
    );
    expect(frame.causal_logic.some((line) => /because.*moon in virgo/i.test(line))).toBe(true);
  });

  it("throws for unsupported dates", async () => {
    await expect(runInterpreter({ date: "2025-12-19" })).rejects.toThrow();
  });

  it("fails schema when dominant axis collapses to a single abstract theme", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: { statement: "unity", primary: "unity", counter: "momentum" },
      tone_descriptor: "calm",
      why_today: ["today"],
      supporting_themes: ["grounded example"],
      sky_anchors: [
        { type: "moon_sign", label: "Moon in Virgo", meaning: "refinement" },
      ],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "today offers a brief window",
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
      why_today: ["today"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "today offers a brief window",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when causal logic omits a plain 'because'", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: {
        statement: "integration over momentum",
        primary: "integration",
        counter: "momentum",
      },
      tone_descriptor: "calm",
      why_today: ["today"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [{ type: "moon_sign", label: "Moon in Virgo", meaning: "refinement" }],
      causal_logic: ["Moon in Virgo slows momentum and highlights gaps."],
      why_today_clause: "today offers a brief window",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when 'why today' lacks temporal specificity", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: {
        statement: "integration over momentum",
        primary: "integration",
        counter: "momentum",
      },
      tone_descriptor: "calm",
      why_today: ["integration window"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [{ type: "moon_sign", label: "Moon in Virgo", meaning: "refinement" }],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "integration window",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when a sky anchor label is not explicit about the sky condition", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: {
        statement: "integration over momentum",
        primary: "integration",
        counter: "momentum",
      },
      tone_descriptor: "calm",
      why_today: ["today"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [{ type: "moon_sign", label: "emotional tides", meaning: "refinement" }],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "today offers a brief window",
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
    });
    expect(result.success).toBe(false);
  });
});
