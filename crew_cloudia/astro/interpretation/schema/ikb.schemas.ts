import { z } from "zod";

const shortSnippet = z
  .string()
  .min(1, "snippet cannot be empty")
  .max(64, "snippet too long")
  .refine((value) => !/\n/.test(value), "newlines are not allowed")
  .refine(
    (value) => !value.trim().endsWith("."),
    "trailing periods are not allowed"
  );

const snippetArray = z.array(shortSnippet);

export const InterpretationLayerSchema = z.enum(["A", "B", "C", "D"]);
export type InterpretationLayer = z.infer<typeof InterpretationLayerSchema>;

const AppliedRuleRefSchema = z.object({
  id: shortSnippet,
  version: shortSnippet,
});

const TraceSchema = z.object({
  applied_rules: z.array(AppliedRuleRefSchema).min(1),
});

const LayerCore = z.object({
  focus: snippetArray.min(1),
  interpretation: snippetArray.min(1),
  rationale: snippetArray.min(1),
  trace: TraceSchema,
});

export const LayerASchema = LayerCore.extend({
  layer: z.literal("A"),
  highlights: snippetArray.min(1),
});

export const LayerBSchema = LayerCore.extend({
  layer: z.literal("B"),
  risks: snippetArray.min(1),
  mitigations: snippetArray.min(1),
});

export const LayerCSchema = LayerCore.extend({
  layer: z.literal("C"),
  opportunities: snippetArray.min(1),
  actions: snippetArray.min(1),
});

export const LayerDSchema = LayerCore.extend({
  layer: z.literal("D"),
  signals: snippetArray.min(1),
  counter_signals: snippetArray.min(1),
});

export const DailyInterpretationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  layers: z.object({
    A: LayerASchema,
    B: LayerBSchema,
    C: LayerCSchema,
    D: LayerDSchema,
  }),
  trace: TraceSchema,
});

export type AppliedRuleRef = z.infer<typeof AppliedRuleRefSchema>;
export type InterpretationTrace = z.infer<typeof TraceSchema>;
export type LayerA = z.infer<typeof LayerASchema>;
export type LayerB = z.infer<typeof LayerBSchema>;
export type LayerC = z.infer<typeof LayerCSchema>;
export type LayerD = z.infer<typeof LayerDSchema>;
export type DailyInterpretation = z.infer<typeof DailyInterpretationSchema>;
export type InterpretationSnippet = z.infer<typeof shortSnippet>;

