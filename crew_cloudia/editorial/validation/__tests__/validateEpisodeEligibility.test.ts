import { describe, expect, it } from "vitest";
import { SegmentPromptInput } from "../../contracts/segmentPromptInput.js";
import { validateEpisodeEligibility } from "../validateEpisodeEligibility.js";

const baseSegment = (overrides: Partial<SegmentPromptInput>): SegmentPromptInput => ({
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

const validSegments = (): SegmentPromptInput[] => [
  baseSegment({
    segment_key: "intro",
    constraints: { max_ideas: 1, must_acknowledge_uncertainty: false, ban_repetition: true },
  }),
  baseSegment({
    segment_key: "main_themes",
    intent: ["meaning"],
    included_tags: ["theme:two"],
    constraints: { max_ideas: 2, must_acknowledge_uncertainty: false, ban_repetition: true },
  }),
  baseSegment({
    segment_key: "reflection",
    intent: ["integrate"],
    included_tags: ["theme:three"],
    constraints: { max_ideas: 2, must_acknowledge_uncertainty: true, ban_repetition: false },
  }),
  baseSegment({
    segment_key: "closing",
    intent: ["resolve"],
    included_tags: ["theme:four"],
    constraints: { max_ideas: 1, must_acknowledge_uncertainty: false, ban_repetition: true },
  }),
];

describe("validateEpisodeEligibility", () => {
  it("happy path: all segments valid and warnings collected", () => {
    const segments = validSegments();
    const result = validateEpisodeEligibility("2025-01-01", segments);

    expect(result.is_valid).toBe(true);
    expect(result.blocking_segments).toHaveLength(0);
    expect(result.segment_results).toHaveLength(segments.length);
    expect(result.warnings).toHaveLength(0);
  });

  it("identifies a single blocking segment", () => {
    const segments = validSegments().map((segment) =>
      segment.segment_key === "reflection"
        ? {
            ...segment,
            constraints: {
              ...segment.constraints,
              must_acknowledge_uncertainty: false,
            },
          }
        : segment
    );

    const result = validateEpisodeEligibility("2025-01-01", segments);

    expect(result.is_valid).toBe(false);
    expect(result.blocking_segments).toHaveLength(1);
    expect(result.blocking_segments[0].segment_key).toBe("reflection");
    expect(result.blocking_segments[0].reasons).toContain("reflection must acknowledge uncertainty");
  });

  it("aggregates multiple blocking segments in order", () => {
    const segments = validSegments().map((segment) => {
      if (segment.segment_key === "intro") {
        return {
          ...segment,
          constraints: { ...segment.constraints, max_ideas: 2 },
        };
      }
      if (segment.segment_key === "closing") {
        return {
          ...segment,
          constraints: { ...segment.constraints, max_ideas: 2 },
        };
      }
      return segment;
    });

    const result = validateEpisodeEligibility("2025-01-01", segments);

    expect(result.is_valid).toBe(false);
    expect(result.blocking_segments.map((b) => b.segment_key)).toStrictEqual(["intro", "closing"]);
    expect(result.segment_results.map((r) => r.segment_key)).toStrictEqual(
      segments.map((s) => s.segment_key)
    );
  });

  it("surfaces warnings without blocking the episode", () => {
    const warningConstraints = (() => {
      let reads = 0;
      return {
        get max_ideas() {
          reads += 1;
          // First read (global check) -> 1, second read (segment-specific) -> 2, third read (warning) -> 1
          if (reads === 2) return 2;
          return 1;
        },
        must_acknowledge_uncertainty: false,
        ban_repetition: true,
      };
    })();

    const segments = validSegments().map((segment) =>
      segment.segment_key === "main_themes"
        ? {
            ...segment,
            constraints: warningConstraints,
          }
        : segment
    );

    const result = validateEpisodeEligibility("2025-01-01", segments);

    expect(result.is_valid).toBe(true);
    expect(result.blocking_segments).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].segment_key).toBe("main_themes");
    expect(result.warnings[0].warnings).toContain(
      "example required by contract; max_ideas = 1 may constrain examples"
    );
  });

  it("throws on duplicate segment keys", () => {
    const segments = [
      baseSegment({ segment_key: "intro" }),
      baseSegment({ segment_key: "intro", intent: ["repeat"], included_tags: ["theme:dup"] }),
    ];

    expect(() => validateEpisodeEligibility("2025-01-01", segments)).toThrow(/duplicate/i);
  });

  it("throws when no segments provided", () => {
    expect(() => validateEpisodeEligibility("2025-01-01", [])).toThrow(/at least one segment/i);
  });

  it("is deterministic for identical inputs", () => {
    const segments = validSegments();
    const first = validateEpisodeEligibility("2025-01-01", segments);
    const second = validateEpisodeEligibility("2025-01-01", segments);

    expect(first).toStrictEqual(second);
  });
});


