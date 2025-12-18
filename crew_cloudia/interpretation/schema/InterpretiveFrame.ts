import { z } from "zod";

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SkyAnchorSchema = z.object({
  type: z.enum(["sun_sign", "moon_sign", "major_aspect"]),
  label: z.string().min(1),
  meaning: z.string().min(1),
});

export const InterpretiveFrameSchema = z.object({
  date: DateStringSchema,
  dominant_contrast_axis: z.object({
    statement: z
      .string()
      .min(1)
      .regex(/ over /i, "contrast statement must express X over Y"),
    primary: z.string().min(1),
    counter: z.string().min(1),
  }),
  tone_descriptor: z.string().min(1),
  why_today: z.array(z.string().min(1)).min(1).max(4),
  supporting_themes: z.array(z.string().min(1)).max(8),
  sky_anchors: z.array(SkyAnchorSchema).min(1).max(2),
  causal_logic: z.array(z.string().min(1)).min(1),
  why_today_clause: z.string().min(1),
  timing: z.object({
    state: z.enum(["building", "peaking", "settling", "transitioning"]),
    notes: z.string().min(1).optional(),
  }),
  confidence_level: z.enum(["high", "medium", "low"]),
  canon_compliance: z.object({
    violations: z.array(z.string().min(1)),
    notes: z.array(z.string().min(1)),
  }),
});

export type InterpretiveFrame = z.infer<typeof InterpretiveFrameSchema>;

