import { describe, expect, it } from "vitest";
import { evaluateSegmentWithFrame } from "../evaluateSegmentWithFrame.js";
import { InterpretiveFrame } from "../../../interpretation/schema/InterpretiveFrame.js";

function buildFrame(overrides: Partial<InterpretiveFrame> = {}): InterpretiveFrame {
  return {
    date: "2025-12-19",
    dominant_contrast_axis: {
      statement: "integration over momentum",
      primary: "integration",
      counter: "momentum",
    },
    tone_descriptor: "steady",
    why_today: ["today window"],
    supporting_themes: [],
    sky_anchors: [
      {
        type: "moon_sign",
        label: "Moon in Virgo",
        meaning: "refinement",
      },
    ],
    causal_logic: ["Because the Moon in Virgo slows momentum."],
    why_today_clause: "today window",
    temporal_phase: "building",
    intensity_modifier: "emerging",
    continuity: {},
    temporal_arc: {
      type: "lunar_phase",
      phase: "building",
      intensity: "emerging",
      arc_day_index: 1,
      arc_total_days: 7,
    },
    timing: { state: "building" },
    signals: [
      {
        signal_key: "moon_ingress_virgo_next_24h",
        kind: "ingress",
        salience: 0.2,
        source: "sky_features",
        meta: { body: "moon", from_sign: "leo", to_sign: "virgo", window: "next_24h" },
      },
      {
        signal_key: "moon_phase_new",
        kind: "lunar_phase",
        salience: 0.45,
        source: "sky_features",
        meta: { phase: "new" },
      },
    ],
    interpretation_bundles: { primary: [], secondary: [], suppressed: [] },
    confidence_level: "high",
    canon_compliance: { violations: [], notes: [] },
    ...overrides,
  };
}

const compliantScript = `
Primary Meanings
Integration over momentum on a building, emerging day.

Relevance
Because the Moon in Virgo highlights this today window.

Concrete Example
People work with the building energy and keep the emerging mood grounded.

Confidence Alignment
Confidence stays high while you reference the Moon in Virgo today.
`.trim();

describe("evaluateSegmentWithFrame", () => {
  it("allows grounded moon ingress references even when not selected as bundles", () => {
    const frame = buildFrame();
    const evaluation = evaluateSegmentWithFrame({
      interpretive_frame: frame,
      segment_key: "main_themes",
      draft_script: compliantScript,
      attempt: 0,
      max_attempts: 1,
    });

    expect(evaluation.decision).toBe("APPROVE");
    expect(evaluation.blocking_reasons).toHaveLength(0);
  });

  it("blocks invented entities not present in bundles, signals, or sky features", () => {
    const frame = buildFrame();
    const evaluation = evaluateSegmentWithFrame({
      interpretive_frame: frame,
      segment_key: "main_themes",
      draft_script: `${compliantScript}\n\nAlso, Pluto rewrites everything.`,
      attempt: 0,
      max_attempts: 1,
    });

    expect(evaluation.decision).not.toBe("APPROVE");
    expect(evaluation.blocking_reasons).toContain("UNGROUNDED_INTERPRETATION");
  });
});

