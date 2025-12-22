import { describe, expect, it } from "vitest";
import { evaluateAdherenceRubric } from "../adherence_rubric.js";
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
    lunation: {
      kind: "new",
      sign: "Virgo",
      signal_key: "moon_phase_new",
    },
    signals: [
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

describe("Editorial Rubric v2.1 adherence", () => {
  it("flags banned abstraction language", () => {
    const result = evaluateAdherenceRubric({
      script: "Primary meanings and relevance are listed without human stakes.",
      segment_key: "main_themes",
      interpretive_frame: buildFrame(),
    });
    expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:primary meanings");
  });

  it("flags system-level astrology explanation without lived consequence", () => {
    const result = evaluateAdherenceRubric({
      script: "In astrology, the dominant contrast axis represents the idea of tension over ease. Focus is firmly on symbolism.",
      segment_key: "main_themes",
      interpretive_frame: buildFrame(),
    });
    expect(result.blocking_reasons).toContain("SYSTEM_LEVEL_EXPLANATION");
  });

  it("fails lunation mention that is not front-loaded with feeling markers", () => {
    const result = evaluateAdherenceRubric({
      script: "The Moon entered Aries this morning and after that the day unfolds in sequence. Details land later.",
      segment_key: "main_themes",
      interpretive_frame: buildFrame(),
    });
    expect(result.blocking_reasons).toContain("LUNATION_NOT_FRONT_LOADED");
  });

  it("fails abstract paragraph without human translation in main_themes", () => {
    const result = evaluateAdherenceRubric({
      script: "Meaning and values stay in the realm of concepts. Themes are discussed as ideas alone.",
      segment_key: "main_themes",
      interpretive_frame: buildFrame({ lunation: undefined }),
    });
    expect(result.blocking_reasons).toContain("ABSTRACT_WITHOUT_TRANSLATION");
  });

  it("fails closing segments that lack behavioral affordance", () => {
    const result = evaluateAdherenceRubric({
      script: "You notice the weight of today and how it lands. Let that awareness settle in your body.",
      segment_key: "closing",
      interpretive_frame: buildFrame({ lunation: undefined }),
    });
    expect(result.blocking_reasons).toContain("NO_BEHAVIORAL_AFFORDANCE");
  });

  it("fails when a closing repeats a prior template", () => {
    const prior = "Take a breath and notice your body unwinding. You are held right now.";
    const result = evaluateAdherenceRubric({
      script: prior,
      segment_key: "closing",
      interpretive_frame: buildFrame({ lunation: undefined }),
      previous_closings: [prior],
    });
    expect(result.blocking_reasons).toContain("REPEATED_CLOSING_TEMPLATE");
  });

  it("passes for human, directive scripts with translation and affordance", () => {
    const result = evaluateAdherenceRubric({
      script: [
        "You text a friend to say you're wiped and dont want to meet.",
        "Take the space; you dont have to answer every ping.",
        "The energy sits in your chest and in your body, so stop pushing for their sake.",
      ].join(" "),
      segment_key: "main_themes",
      interpretive_frame: buildFrame({ lunation: undefined }),
    });
    expect(result.blocking_reasons).toHaveLength(0);
  });

  describe("Phase D regression tests: scaffold language must fail", () => {
    it("fails when rubric scaffolding appears (primary meanings)", () => {
      const result = evaluateAdherenceRubric({
        script: "Primary Meanings\nToday's focus is on integration over momentum.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:primary meanings");
    });

    it("fails when rubric scaffolding appears (relevance)", () => {
      const result = evaluateAdherenceRubric({
        script: "Relevance\nThis matters because the Moon is in Virgo.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:relevance");
    });

    it("fails when rubric scaffolding appears (concrete example)", () => {
      const result = evaluateAdherenceRubric({
        script: "Concrete Example\nYou notice the tension in your body.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:concrete example");
    });

    it("fails when rubric scaffolding appears (confidence alignment)", () => {
      const result = evaluateAdherenceRubric({
        script: "Confidence Alignment\nThis reflects a high confidence level.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:confidence alignment");
    });

    it("fails when meaning over minutiae appears", () => {
      const result = evaluateAdherenceRubric({
        script: "The focus is meaning over minutiae today. You feel the shift.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:meaning over minutiae");
    });

    it("fails when dominant contrast appears", () => {
      const result = evaluateAdherenceRubric({
        script: "The dominant contrast axis is integration over momentum.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:dominant contrast");
    });

    it("fails when contrast axis appears", () => {
      const result = evaluateAdherenceRubric({
        script: "The contrast axis shows integration over momentum.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:contrast axis");
    });
  });

  describe("Phase D regression tests: system-level explanation must fail", () => {
    it("fails on system-level astrology explanation", () => {
      const result = evaluateAdherenceRubric({
        script: "Astrologically speaking, Sagittarius represents the idea of expansion and meaning.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("SYSTEM_LEVEL_EXPLANATION");
    });

    it("fails when focus is firmly on appears", () => {
      const result = evaluateAdherenceRubric({
        script: "Focus is firmly on integration today. You notice the shift.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons).toContain("HARD_BANNED_LANGUAGE:focus is firmly on");
    });
  });

  describe("Phase D regression tests: no headings + strong prose passes", () => {
    it("passes human, unstructured prose without headings", () => {
      const result = evaluateAdherenceRubric({
        script: "If today feels different, trust that. You don't have to act yet. The energy sits in your chest.",
        segment_key: "intro",
        interpretive_frame: buildFrame({ lunation: { kind: "new", sign: "Virgo", signal_key: "moon_phase_new" } }),
      });
      expect(result.blocking_reasons.length).toBe(0);
    });

    it("passes main_themes without headings but with relational translation", () => {
      const result = evaluateAdherenceRubric({
        script: "You text a friend to say you're done. Take the space. The energy sits in your body.",
        segment_key: "main_themes",
        interpretive_frame: buildFrame(),
      });
      expect(result.blocking_reasons.length).toBe(0);
    });
  });
});

