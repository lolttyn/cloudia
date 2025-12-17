import { describe, expect, it } from "vitest";
import { SegmentPromptInput } from "../../contracts/segmentPromptInput.js";
import { validateSegmentEligibility } from "../validateSegmentEligibility.js";

const baseInput = (overrides: Partial<SegmentPromptInput>): SegmentPromptInput => ({
  episode_date: "2025-01-01",
  segment_key: "intro",
  intent: ["orientation"],
  included_tags: ["theme:one"],
  suppressed_tags: [],
  confidence_level: "high",
  constraints: {
    max_ideas: 1,
    must_acknowledge_uncertainty: false,
    ban_repetition: true,
  },
  ...overrides,
});

describe("validateSegmentEligibility", () => {
  it("accepts valid inputs per segment", () => {
    const intro = baseInput({});
    const mainThemes = baseInput({
      segment_key: "main_themes",
      intent: ["meaning"],
      included_tags: ["theme:two"],
      constraints: { max_ideas: 2, must_acknowledge_uncertainty: false, ban_repetition: true },
    });
    const reflection = baseInput({
      segment_key: "reflection",
      intent: ["integrate"],
      included_tags: ["theme:three"],
      constraints: { max_ideas: 2, must_acknowledge_uncertainty: true, ban_repetition: false },
    });
    const closing = baseInput({
      segment_key: "closing",
      intent: ["resolve"],
      included_tags: ["theme:four"],
      constraints: { max_ideas: 1, must_acknowledge_uncertainty: false, ban_repetition: true },
    });

    [intro, mainThemes, reflection, closing].forEach((input) => {
      const result = validateSegmentEligibility(input);
      expect(result.is_valid).toBe(true);
      expect(result.blocking_reasons).toHaveLength(0);
    });
  });

  it("blocks empty intent", () => {
    const result = validateSegmentEligibility(baseInput({ intent: [] }));
    expect(result.is_valid).toBe(false);
    expect(result.blocking_reasons).toContain("intent is empty");
  });

  it("blocks intro with invalid max_ideas", () => {
    const result = validateSegmentEligibility(
      baseInput({ constraints: { max_ideas: 2, must_acknowledge_uncertainty: false, ban_repetition: true } })
    );
    expect(result.is_valid).toBe(false);
    expect(result.blocking_reasons).toContain("intro requires max_ideas === 1");
  });

  it("blocks closing with invalid max_ideas", () => {
    const result = validateSegmentEligibility(
      baseInput({
        segment_key: "closing",
        constraints: { max_ideas: 2, must_acknowledge_uncertainty: false, ban_repetition: true },
      })
    );
    expect(result.is_valid).toBe(false);
    expect(result.blocking_reasons).toContain("closing requires max_ideas === 1");
  });

  it("blocks reflection without mandated uncertainty acknowledgement", () => {
    const result = validateSegmentEligibility(
      baseInput({
        segment_key: "reflection",
        constraints: { max_ideas: 2, must_acknowledge_uncertainty: false, ban_repetition: false },
      })
    );
    expect(result.is_valid).toBe(false);
    expect(result.blocking_reasons).toContain("reflection must acknowledge uncertainty");
  });

  it("blocks when uncertainty required but contract forbids it", () => {
    const result = validateSegmentEligibility(
      baseInput({
        constraints: { max_ideas: 1, must_acknowledge_uncertainty: true, ban_repetition: true },
      })
    );
    expect(result.is_valid).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const input = baseInput({});
    const first = validateSegmentEligibility(input);
    const second = validateSegmentEligibility(input);
    expect(first).toStrictEqual(second);
  });

  it("requires included tags or explicit zero-tag intent", () => {
    const withoutTags = validateSegmentEligibility(
      baseInput({ included_tags: [] })
    );
    expect(withoutTags.is_valid).toBe(false);
    expect(withoutTags.blocking_reasons).toContain(
      "included_tags empty without intent justification"
    );

    const justified = validateSegmentEligibility(
      baseInput({ included_tags: [], intent: ["orientation", "allow_zero_tags"] })
    );
    expect(justified.is_valid).toBe(true);
  });
});


