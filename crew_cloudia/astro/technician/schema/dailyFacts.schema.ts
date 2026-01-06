import { z } from "zod";

/**
 * Zod schema for Layer 1 daily facts output
 * 
 * This schema validates the deterministic astrological facts extracted
 * from sky_state according to the technician policy.
 * 
 * Layer 1 is selection + classification, not "all positions".
 * Body positions are not duplicated here; they exist in the source sky_state.
 */

const AspectTypeSchema = z.enum([
  "conjunction",
  "sextile",
  "square",
  "trine",
  "opposition",
]);

const BodyIdSchema = z.enum([
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
  "north_node",
  "south_node",
]);

const SignNameSchema = z.enum([
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
]);

/**
 * An aspect transit fact (primary or secondary salience)
 */
const TransitFactSchema = z.object({
  body_a: BodyIdSchema,
  body_b: BodyIdSchema,
  aspect_type: AspectTypeSchema,
  orb_deg: z.number().min(0),
  is_exact: z.boolean(), // true if orb <= primary_exact_threshold_deg from policy
});

/**
 * A retrograde condition fact
 */
const RetrogradeConditionSchema = z.object({
  kind: z.literal("retrograde"),
  body: BodyIdSchema,
});

/**
 * A sign ingress condition fact
 */
const IngressConditionSchema = z.object({
  kind: z.literal("ingress"),
  body: BodyIdSchema,
  from_sign: SignNameSchema,
  to_sign: SignNameSchema,
});

/**
 * A lunation condition fact
 */
const LunationConditionSchema = z.object({
  kind: z.literal("lunation"),
  phase: z.enum([
    "new",
    "waxing_crescent",
    "first_quarter",
    "waxing_gibbous",
    "full",
    "waning_gibbous",
    "last_quarter",
    "waning_crescent",
  ]),
  /** Optional: sign where the lunation occurs */
  sign: SignNameSchema.optional(),
});

/**
 * A background aspect (only if include_background_aspects is true)
 */
const BackgroundAspectConditionSchema = z.object({
  kind: z.literal("aspect"),
  body_a: BodyIdSchema,
  body_b: BodyIdSchema,
  aspect_type: AspectTypeSchema,
  orb_deg: z.number().min(0),
});

/**
 * Union of all condition fact types
 */
const ConditionFactSchema = z.discriminatedUnion("kind", [
  RetrogradeConditionSchema,
  IngressConditionSchema,
  LunationConditionSchema,
  BackgroundAspectConditionSchema,
]);

/**
 * A record of something that was excluded from facts
 */
const ExcludedRecordSchema = z.object({
  /** What was excluded (e.g., "aspect", "body", "orb_too_large") */
  category: z.string().min(1),
  /** Human-readable reason */
  reason: z.string().min(1),
  /** Optional context data (e.g., body names, orb value) */
  context: z.record(z.unknown()).optional(),
});

/**
 * Reference to the source sky_state
 */
const SourceReferenceSchema = z.object({
  sky_state_schema_version: z.string().min(1),
  engine: z.string().min(1), // e.g., "swisseph"
  engine_version: z.string().min(1),
  ephemeris_fileset: z.string().min(1),
});

/**
 * Interpreter transit source metadata
 * Tracks where the transit came from in the original facts structure
 */
const InterpreterTransitSourceSchema = z.object({
  kind: z.enum(["aspect", "retrograde", "ingress", "lunation"]),
  body_a: BodyIdSchema.optional(),
  body_b: BodyIdSchema.optional(),
  aspect_type: AspectTypeSchema.optional(),
  condition_id: z.string().optional(),
});

/**
 * Interpreter transit (compatibility view for legacy interpreter)
 * 
 * This is a flattened, deterministic view of transits that matches the
 * legacy interpreter's MockFacts input shape. All fields are derived
 * deterministically from SkyStateDaily + existing facts.
 */
const InterpreterTransitSchema = z.object({
  planet: BodyIdSchema,
  sign: SignNameSchema,
  salience: z.enum(["primary", "secondary", "background"]),
  orb_deg: z.number().min(0),
  duration_days: z.number().int().min(0),
  retrograde: z.boolean(),
  source: InterpreterTransitSourceSchema,
});

/**
 * Daily Facts Schema
 * 
 * The complete output of Layer 1 fact extraction.
 * Facts are organized into three buckets: primary transits, secondary transits,
 * and background conditions. This structure prevents downstream layers from
 * re-bucketing and ensures deterministic selection.
 */
export const DailyFactsSchema = z.object({
  schema_version: z.string().min(1), // e.g., "1.0.0"
  technician_policy_version: z.string().min(1), // e.g., "tech_v1"
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timestamp_generated: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  
  /** Reference to the source sky_state (positions not duplicated here) */
  source: SourceReferenceSchema,
  
  /** Primary salience transits (aspects with tight orbs) */
  transits_primary: z.array(TransitFactSchema),
  
  /** Secondary salience transits (aspects with moderate orbs) */
  transits_secondary: z.array(TransitFactSchema),
  
  /** Background conditions (retrogrades, ingresses, lunations, optional background aspects) */
  background_conditions: z.array(ConditionFactSchema),
  
  /** Records of items that were excluded/ignored during extraction */
  excluded: z.array(ExcludedRecordSchema),
  
  /** 
   * Canonical flattened transit view for legacy interpreter compatibility
   * 
   * This field provides a deterministic mapping from DailyFacts to the
   * interpreter's expected input shape. All fields are derived from
   * SkyStateDaily + existing facts with pinned rules (no heuristics).
   */
  interpreter_transits_v1: z.array(InterpreterTransitSchema),
});

export type DailyFacts = z.infer<typeof DailyFactsSchema>;
export type TransitFact = z.infer<typeof TransitFactSchema>;
export type ConditionFact = z.infer<typeof ConditionFactSchema>;
export type RetrogradeCondition = z.infer<typeof RetrogradeConditionSchema>;
export type IngressCondition = z.infer<typeof IngressConditionSchema>;
export type LunationCondition = z.infer<typeof LunationConditionSchema>;
export type BackgroundAspectCondition = z.infer<typeof BackgroundAspectConditionSchema>;
export type ExcludedRecord = z.infer<typeof ExcludedRecordSchema>;
export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type InterpreterTransit = z.infer<typeof InterpreterTransitSchema>;
export type InterpreterTransitSource = z.infer<typeof InterpreterTransitSourceSchema>;
export type AspectType = z.infer<typeof AspectTypeSchema>;
export type BodyId = z.infer<typeof BodyIdSchema>;
export type SignName = z.infer<typeof SignNameSchema>;

