import { z } from "zod";

export const SIGNAL_KEY_REGEX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

const TemporalMeta = z
  .object({
    temporal_window: z.enum(["past_24h", "next_24h"]).optional(),
    temporal_label: z.enum(["entering", "exiting"]).optional(),
  })
  .passthrough();

export const InterpretationSignalSchema = z.object({
  signal_key: z
    .string()
    .min(1)
    .regex(SIGNAL_KEY_REGEX, "signal_key must be lowercase snake_case"),
  kind: z.enum(["planet_in_sign", "aspect", "lunar_phase", "ingress", "lunation"]),
  salience: z
    .number()
    .min(0, "salience must be >= 0")
    .max(1, "salience must be <= 1"),
  source: z.literal("sky_features"),
  orb_deg: z.number().nonnegative().optional(),
  meta: TemporalMeta.optional(),
});

export type InterpretationSignal = z.infer<typeof InterpretationSignalSchema>;
