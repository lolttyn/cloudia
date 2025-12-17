import { describe, expect, it } from "vitest";
import { CANON_V0_1 } from "../canon.v0_1";
import { CanonConstraintSchema } from "../canon.schemas";

const detect = (text: string, detectors: { kind: string }[]) =>
  detectors.some((detector) => {
    if (detector.kind === "phrase_list") {
      const phrases = (detector as {
        phrases: string[];
        case_sensitive?: boolean;
      }).phrases;
      const cs = (detector as { case_sensitive?: boolean }).case_sensitive;
      const source = cs ? text : text.toLowerCase();
      return phrases.some((p) =>
        cs ? text.includes(p) : source.includes(p.toLowerCase())
      );
    }
    if (detector.kind === "regex") {
      const { pattern, flags } = detector as { pattern: string; flags?: string };
      return new RegExp(pattern, flags).test(text);
    }
    return false;
  });

describe("CANON_V0_1", () => {
  it("all constraints validate against the schema", () => {
    CANON_V0_1.forEach((constraint) => {
      const parsed = CanonConstraintSchema.safeParse(constraint);
      expect(parsed.success).toBe(true);
    });
  });

  it("each constraint has detectors and examples", () => {
    CANON_V0_1.forEach((constraint) => {
      expect(constraint.detectors.length).toBeGreaterThan(0);
      expect(constraint.examples.block.length).toBeGreaterThan(0);
      expect(constraint.examples.allow.length).toBeGreaterThan(0);
    });
  });

  it("block examples are actually caught by their detectors", () => {
    CANON_V0_1.forEach((constraint) => {
      constraint.examples.block.forEach((example) => {
        const matched = detect(example, constraint.detectors as any[]);
        expect(matched).toBe(true);
      });
    });
  });

  it("flags determinism and medical claims as failing examples", () => {
    const determinism = CANON_V0_1.find(
      (c) => c.id === "determinism.language"
    );
    const medical = CANON_V0_1.find((c) => c.id === "medical.claims");

    expect(determinism).toBeDefined();
    expect(medical).toBeDefined();

    const determinismFail = determinism!.examples.block[0];
    const medicalFail = medical!.examples.block[0];

    expect(detect(determinismFail, determinism!.detectors as any[])).toBe(true);
    expect(detect(medicalFail, medical!.detectors as any[])).toBe(true);
  });
});

