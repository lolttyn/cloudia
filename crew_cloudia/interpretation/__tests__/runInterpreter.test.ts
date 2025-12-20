import { describe, expect, it } from "vitest";
import interpretiveCanon from "../canon/interpretiveCanon_v1.json" assert { type: "json" };
import { runInterpreter } from "../runInterpreter.js";
import { InterpretiveFrameSchema } from "../schema/InterpretiveFrame.js";

const stubFeatures = {
  date: "2025-12-18",
  sun: { sign: "Sagittarius", longitude: 255 },
  moon: { sign: "Virgo", phase: "waning" as const, longitude: 182 },
  highlights: [
    {
      type: "aspect" as const,
      bodies: ["Sun", "Moon"] as const,
      aspect: "square" as const,
      orb_deg: 2.1,
    },
    {
      type: "ingress" as const,
      body: "Moon" as const,
      from_sign: "Leo",
      to_sign: "Virgo",
      window: "past_24h" as const,
    },
  ],
};

describe("runInterpreter (production engine)", () => {
  it("produces deterministic frames for the same date input", async () => {
    const first = await runInterpreter({ date: stubFeatures.date, features: stubFeatures });
    const second = await runInterpreter({ date: stubFeatures.date, features: stubFeatures });

    expect(() => InterpretiveFrameSchema.parse(first)).not.toThrow();
    expect(first).toStrictEqual(second);
    expect(first.sky_anchors.map((a) => a.label)).toEqual(
      expect.arrayContaining(["Moon in Virgo", "Sun in Sagittarius"])
    );
    expect(first.signals.length).toBeGreaterThanOrEqual(2);
    expect(first.signals.every((s) => s.source === "sky_features")).toBe(true);
  });

  it("fails loudly when canon coverage is missing for a sky state", async () => {
    const canonMissingMoon = { ...interpretiveCanon, moon_signs: {} } as typeof interpretiveCanon;

    await expect(
      runInterpreter({ date: stubFeatures.date, features: stubFeatures, canon: canonMissingMoon })
    ).rejects.toThrow(/No canon entry for Moon in Virgo/i);
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      temporal_arc: {
        type: "lunar_phase",
        phase: "building",
        intensity: "emerging",
        arc_day_index: 1,
        arc_total_days: 7,
      },
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      temporal_arc: {
        type: "lunar_phase",
        phase: "building",
        intensity: "emerging",
        arc_day_index: 1,
        arc_total_days: 7,
      },
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      temporal_arc: {
        type: "lunar_phase",
        phase: "building",
        intensity: "emerging",
        arc_day_index: 1,
        arc_total_days: 7,
      },
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      temporal_arc: {
        type: "lunar_phase",
        phase: "building",
        intensity: "emerging",
        arc_day_index: 1,
        arc_total_days: 7,
      },
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
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
      temporal_phase: "building",
      intensity_modifier: "emerging",
      temporal_arc: {
        type: "lunar_phase",
        phase: "building",
        intensity: "emerging",
        arc_day_index: 1,
        arc_total_days: 7,
      },
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when temporal_phase is missing", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: { statement: "integration over momentum", primary: "integration", counter: "momentum" },
      tone_descriptor: "calm",
      why_today: ["today"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [{ type: "moon_sign", label: "Moon in Virgo", meaning: "refinement" }],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "today offers a brief window",
      intensity_modifier: "emerging",
      continuity: {},
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
    });
    expect(result.success).toBe(false);
  });

  it("fails schema when continuity hook exceeds one sentence", () => {
    const result = InterpretiveFrameSchema.safeParse({
      date: "2025-12-18",
      dominant_contrast_axis: { statement: "integration over momentum", primary: "integration", counter: "momentum" },
      tone_descriptor: "calm",
      why_today: ["today"],
      supporting_themes: ["specific grounding"],
      sky_anchors: [{ type: "moon_sign", label: "Moon in Virgo", meaning: "refinement" }],
      causal_logic: ["Because the Moon in Virgo slows momentum."],
      why_today_clause: "today offers a brief window",
      temporal_phase: "building",
      intensity_modifier: "emerging",
      continuity: { references_yesterday: "Sentence one. Sentence two." },
      timing: { state: "settling" },
      confidence_level: "medium",
      canon_compliance: { violations: [], notes: [] },
      signals: [sampleSignal()],
      interpretation_bundles: sampleBundles(),
    });
    expect(result.success).toBe(false);
  });

  it("emits lunation metadata and selects lunation bundle when present", async () => {
    const frame = await runInterpreter({
      date: "2025-12-19",
      features: {
        date: "2025-12-19",
        sun: { sign: "Sagittarius", longitude: 268.5 },
        moon: { sign: "Sagittarius", phase: "new", longitude: 268.9 },
        highlights: [],
      },
    });

    expect(frame.lunation?.kind).toBe("new");
    expect(frame.lunation?.sign).toBe("sagittarius");
    expect(frame.lunation?.signal_key).toBe("new_moon_in_sagittarius");
    expect(frame.interpretation_bundles.primary[0]?.slug).toBe(
      "new_moon_in_sagittarius"
    );
  });
});

function sampleSignal() {
  return {
    signal_key: "sun_in_virgo",
    kind: "planet_in_sign" as const,
    salience: 0.35,
    source: "sky_features" as const,
  };
}

function sampleBundles() {
  return { primary: [], secondary: [], suppressed: [] };
}
