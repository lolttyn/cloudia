import { z } from "zod";
import { SegmentKeyV1 } from "./types.js";

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SegmentKeySchema = z.enum([
  "intro",
  "main_themes",
  "reflection",
  "closing",
]);

export const SegmentEditorialPlanSchema = z.object({
  segment_key: SegmentKeySchema,
  intent: z.array(z.string()),
  included_tags: z.array(z.string()),
  suppressed_tags: z.array(z.string()),
  rationale: z.array(z.string()),
});

export const EpisodeEditorialPlanSchema = z.object({
  episode_date: DateStringSchema,
  segments: z.array(SegmentEditorialPlanSchema),
  continuity_notes: z.object({
    callbacks: z.array(z.string()),
    avoided_repetition: z.array(z.string()),
  }),
  debug: z.object({
    selected_by_segment: z.object({
      intro: z.array(z.string()),
      main_themes: z.array(z.string()),
      reflection: z.array(z.string()),
      closing: z.array(z.string()),
    }) as z.ZodType<Record<SegmentKeyV1, string[]>>,
    suppressed_by_rule: z.record(z.array(z.string())),
  }),
});

export type EpisodeEditorialPlanInput = z.input<typeof EpisodeEditorialPlanSchema>;

