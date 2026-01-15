import { z } from "zod";

/**
 * Zod schema for sky_state.
 *
 * Notes on versioning:
 * - v1.0.0: lunar.phase_angle_deg was defined/stored as the absolute smallest separation (0–180).
 * - v1.1.0: adds lunar.elongation_deg (directed, 0–360) + lunar.phase_angle_abs_deg (explicit abs),
 *          while keeping phase_angle_deg as a back-compat alias for the abs angle.
 *
 * This schema intentionally accepts both v1.0.0 and v1.1.0 so persisted historical rows remain readable.
 */

const SIGN_NAMES = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

const BODY_NAMES = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
] as const;

const BodyStateSchema = z.object({
  longitude: z.number().min(0).max(360),
  latitude: z.number().optional(),
  distance_au: z.number().positive().optional(),
  speed_deg_per_day: z.number(),
  retrograde: z.boolean(),
  sign: z.enum(SIGN_NAMES),
  sign_degree: z.number().min(0).max(30),
});

const TimestampSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  utc_datetime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  timezone: z.literal("UTC"),
  julian_day: z.number().positive(),
});

const MetaSchema = z.object({
  engine: z.literal("swisseph"),
  engine_version: z.string(),
  ephemeris_fileset: z.string(),
  coordinate_system: z.literal("tropical"),
  timestamp_generated: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
});

const AspectSchema = z.object({
  body_a: z.enum(BODY_NAMES),
  body_b: z.enum(BODY_NAMES),
  type: z.enum(["conjunction", "sextile", "square", "trine", "opposition"]),
  orb_deg: z.number().min(0).max(180),
});

const LunarPhaseNameSchema = z.enum([
  "new",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
]);

const LunarPhaseSchemaV1_0_0 = z.object({
  phase_name: LunarPhaseNameSchema,
  // Historical: absolute smallest separation (0–180)
  phase_angle_deg: z.number().min(0).max(180),
  illumination_pct: z.number().min(0).max(100),
});

const LunarPhaseSchemaV1_1_0 = z
  .object({
    phase_name: LunarPhaseNameSchema,
    // Directed elongation (Moon - Sun) in [0, 360)
    elongation_deg: z.number().min(0).max(360),
    // Explicit abs (0–180)
    phase_angle_abs_deg: z.number().min(0).max(180),
    // Back-compat alias (kept equal to abs)
    phase_angle_deg: z.number().min(0).max(180),
    illumination_pct: z.number().min(0).max(100),
  })
  .superRefine((val, ctx) => {
    // Keep the two abs fields consistent (tolerate tiny rounding differences).
    if (Math.abs(val.phase_angle_deg - val.phase_angle_abs_deg) > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phase_angle_deg must match phase_angle_abs_deg (within rounding tolerance)",
        path: ["phase_angle_deg"],
      });
    }
  });

const SkyStateBaseSchema = z.object({
  meta: MetaSchema,
  timestamp: TimestampSchema,
  bodies: z.record(z.enum(BODY_NAMES), BodyStateSchema),
  aspects: z.array(AspectSchema),
});

const SkyStateSchemaV1_0_0 = SkyStateBaseSchema.extend({
  schema_version: z.literal("1.0.0"),
  lunar: LunarPhaseSchemaV1_0_0,
});

const SkyStateSchemaV1_1_0 = SkyStateBaseSchema.extend({
  schema_version: z.literal("1.1.0"),
  lunar: LunarPhaseSchemaV1_1_0,
});

export const SkyStateSchema = z.union([SkyStateSchemaV1_0_0, SkyStateSchemaV1_1_0]);

export type SkyState = z.infer<typeof SkyStateSchema>;
export type BodyState = z.infer<typeof BodyStateSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Aspect = z.infer<typeof AspectSchema>;
export type LunarPhase = z.infer<typeof LunarPhaseSchemaV1_0_0> | z.infer<typeof LunarPhaseSchemaV1_1_0>;

