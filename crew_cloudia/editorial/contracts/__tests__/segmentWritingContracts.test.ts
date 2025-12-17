import { describe, expect, it } from "vitest";
import {
  getWritingContract,
  type SegmentWritingContract,
} from "../segmentWritingContracts.js";

const SEGMENT_KEYS: SegmentWritingContract["segment_key"][] = [
  "intro",
  "main_themes",
  "reflection",
  "closing",
];

describe("segmentWritingContracts", () => {
  it("exposes exactly one contract per segment", () => {
    const contracts = SEGMENT_KEYS.map((key) => getWritingContract(key));
    expect(contracts.map((c) => c.segment_key)).toStrictEqual(SEGMENT_KEYS);
  });

  it("throws on unknown segment keys", () => {
    expect(() => getWritingContract("unknown" as SegmentWritingContract["segment_key"])).toThrow();
  });

  it("ensures contract completeness", () => {
    SEGMENT_KEYS.forEach((key) => {
      const contract = getWritingContract(key);
      expect(contract.required_elements.length).toBeGreaterThan(0);
      expect(contract.forbidden_elements.length).toBeGreaterThan(0);
      expect(contract.failure_modes.length).toBeGreaterThan(0);
      expect(contract.tone_constraints.emotional_range.length).toBeGreaterThan(0);
    });
  });

  it("enforces structural bounds", () => {
    SEGMENT_KEYS.forEach((key) => {
      const structural = getWritingContract(key).structural_requirements;
      expect(structural.min_paragraphs).toBeGreaterThanOrEqual(1);
      expect(structural.max_paragraphs).toBeGreaterThanOrEqual(structural.min_paragraphs);
    });
  });

  it("enforces example requirements only for main themes", () => {
    const mainThemes = getWritingContract("main_themes");
    expect(mainThemes.structural_requirements.requires_example).toBe(true);

    ["intro", "reflection", "closing"].forEach((key) => {
      const contract = getWritingContract(key as SegmentWritingContract["segment_key"]);
      expect(contract.structural_requirements.requires_example).toBe(false);
    });
  });

  it("aligns uncertainty allowances by segment", () => {
    const reflection = getWritingContract("reflection");
    expect(reflection.tone_constraints.allows_uncertainty).toBe(true);

    ["intro", "closing"].forEach((key) => {
      const contract = getWritingContract(key as SegmentWritingContract["segment_key"]);
      expect(contract.tone_constraints.allows_uncertainty).toBe(false);
    });
  });

  it("returns stable references per contract", () => {
    SEGMENT_KEYS.forEach((key) => {
      const first = getWritingContract(key);
      const second = getWritingContract(key);
      expect(first).toBe(second);
    });
  });
});


