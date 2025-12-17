import { describe, expect, it } from "vitest";
import { DailyInterpretationSchema } from "../ikb.schemas";

const validRule = { id: "determinism.language", version: "0.1" };

const layerFactory = (
  layer: "A" | "B" | "C" | "D",
  extra: Record<string, unknown>
) => ({
  layer,
  focus: ["Focus"],
  interpretation: ["Clear and concise"],
  rationale: ["Because of transit mix"],
  trace: { applied_rules: [validRule] },
  ...extra,
});

const validDaily = {
  date: "2025-12-17",
  layers: {
    A: layerFactory("A", { highlights: ["Key theme"] }),
    B: layerFactory("B", { risks: ["Risk"], mitigations: ["Mitigation"] }),
    C: layerFactory("C", { opportunities: ["Opportunity"], actions: ["Action"] }),
    D: layerFactory("D", { signals: ["Signal"], counter_signals: ["Counter"] }),
  },
  trace: { applied_rules: [validRule] },
};

describe("DailyInterpretationSchema", () => {
  it("accepts a valid daily interpretation", () => {
    const result = DailyInterpretationSchema.safeParse(validDaily);
    expect(result.success).toBe(true);
  });

  it("rejects sentence-like strings (newlines)", () => {
    const invalid = {
      ...validDaily,
      layers: {
        ...validDaily.layers,
        A: layerFactory("A", { highlights: ["Key theme\nwith newline"] }),
      },
    };
    const result = DailyInterpretationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects sentence-like strings (too long or trailing periods)", () => {
    const tooLong = "x".repeat(121);
    const invalid = {
      ...validDaily,
      layers: {
        ...validDaily.layers,
        B: layerFactory("B", {
          risks: [tooLong],
          mitigations: ["Ends with period."],
        }),
      },
    };
    const result = DailyInterpretationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing trace.applied_rules references", () => {
    const invalid = {
      ...validDaily,
      trace: { applied_rules: [] },
    };
    const result = DailyInterpretationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

