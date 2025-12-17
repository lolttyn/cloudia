import { z } from "zod";
import { InterpretationLayerSchema } from "../schema/ikb.schemas";

const shortText = z.string().min(1).max(120);

export const PhraseListDetectorSchema = z.object({
  kind: z.literal("phrase_list"),
  phrases: z.array(shortText).min(1),
  case_sensitive: z.boolean().default(false),
});

export const RegexDetectorSchema = z.object({
  kind: z.literal("regex"),
  pattern: z.string().min(1),
  flags: z
    .string()
    .regex(/^[dgimsuy]*$/)
    .optional(),
});

export const DetectorSchema = z.discriminatedUnion("kind", [
  PhraseListDetectorSchema,
  RegexDetectorSchema,
]);

export const CanonConstraintSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  description: shortText,
  applies_to: z.array(InterpretationLayerSchema).min(1),
  enforcement: z.enum(["block", "review", "warn"]),
  detectors: z.array(DetectorSchema).min(1),
  examples: z.object({
    allow: z.array(shortText).min(1),
    block: z.array(shortText).min(1),
  }),
});

export type DetectorSpec = z.infer<typeof DetectorSchema>;
export type CanonConstraint = z.infer<typeof CanonConstraintSchema>;

