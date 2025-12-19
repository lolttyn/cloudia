import { z } from "zod";

export const SIGNAL_KEY_REGEX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const InterpretationSignalSchema = z.object({
  signal_key: z
    .string()
    .min(1)
    .regex(SIGNAL_KEY_REGEX, "signal_key must be lowercase snake_case"),
  kind: z.enum(["planet_in_sign", "aspect", "lunar_phase", "ingress"]),
  salience: z
    .number()
    .min(0, "salience must be >= 0")
    .max(1, "salience must be <= 1"),
  source: z.literal("sky_features"),
  orb_deg: z.number().nonnegative().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type InterpretationSignal = z.infer<typeof InterpretationSignalSchema>;

