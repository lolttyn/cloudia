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
      expect(contract.segment_kind).toBeTruthy();
      expect(contract.intent).toBeTypeOf("string");
      expect(contract.required_sections.length).toBeGreaterThan(0);
      expect(contract.forbidden_elements.phrases).toBeInstanceOf(Array);
      expect(contract.forbidden_elements.claims).toBeInstanceOf(Array);
      expect(contract.forbidden_elements.tones).toBeInstanceOf(Array);
      expect(contract.voice_constraints.perspective).toMatch(/first_person|second_person/);
      expect(contract.voice_constraints.allowed_tones.length).toBeGreaterThan(0);
      expect(contract.length_constraints.min_words).toBeGreaterThan(0);
      expect(contract.length_constraints.max_words).toBeGreaterThan(
        contract.length_constraints.min_words
      );
    });
  });

  it("captures formatting rules explicitly", () => {
    SEGMENT_KEYS.forEach((key) => {
      const contract = getWritingContract(key);
      expect(typeof contract.formatting_rules.allow_bullets).toBe("boolean");
      expect(typeof contract.formatting_rules.allow_questions).toBe("boolean");
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


