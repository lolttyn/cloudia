import { z } from "zod";

/**
 * Zod schema for sky_state v1.0.0
 * Validates the canonical Layer 0 output contract as defined in docs/sky_state.md
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

const LunarPhaseSchema = z.object({
  phase_name: z.enum([
    "new",
    "waxing_crescent",
    "first_quarter",
    "waxing_gibbous",
    "full",
    "waning_gibbous",
    "last_quarter",
    "waning_crescent",
  ]),
  phase_angle_deg: z.number().min(0).max(180),
  illumination_pct: z.number().min(0).max(100),
});

export const SkyStateSchema = z.object({
  schema_version: z.literal("1.0.0"),
  meta: MetaSchema,
  timestamp: TimestampSchema,
  bodies: z.record(z.enum(BODY_NAMES), BodyStateSchema),
  aspects: z.array(AspectSchema),
  lunar: LunarPhaseSchema,
});

export type SkyState = z.infer<typeof SkyStateSchema>;
export type BodyState = z.infer<typeof BodyStateSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type Aspect = z.infer<typeof AspectSchema>;
export type LunarPhase = z.infer<typeof LunarPhaseSchema>;

