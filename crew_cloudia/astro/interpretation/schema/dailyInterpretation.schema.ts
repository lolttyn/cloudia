/**
 * Phase 5.2 Step 2 — DailyInterpretation Schema (Layer 2 Canonical Meaning)
 * 
 * This schema represents the canonical meaning derived from Layer 0/1 inputs.
 * It is deterministic, reproducible, and contains no window logic (that's Phase 5.3).
 * 
 * This is the "source of truth" for interpretation meaning, which will be
 * transformed to InterpretiveFrame for downstream compatibility.
 */

import { z } from "zod";

/**
 * Dominant contrast axis - the primary tension/contrast for the day
 */
const DominantAxisSchema = z.object({
  statement: z.string().min(1), // e.g., "action over reflection"
  primary: z.string().min(1), // The primary pole
  counter: z.string().min(1), // The counter pole
});

/**
 * Sky anchor - a key astronomical reference point
 */
const SkyAnchorSchema = z.object({
  body: z.string().min(1), // e.g., "sun", "moon"
  sign: z.string().min(1), // e.g., "cancer"
  description: z.string().min(1), // Human-readable anchor description
});

/**
 * Interpretation signal - a key signal extracted from the sky state
 */
const InterpretationSignalSchema = z.object({
  signal_key: z.string().min(1), // Canonical signal identifier
  salience: z.enum(["primary", "secondary", "background"]),
  description: z.string().min(1).optional(), // Optional human-readable description
});

/**
 * Interpretation bundle reference
 */
const InterpretationBundleRefSchema = z.object({
  bundle_id: z.string().min(1),
  bundle_slug: z.string().min(1),
  salience_class: z.enum(["primary", "secondary", "background"]),
});

/**
 * DailyInterpretation Schema
 * 
 * Canonical Layer 2 meaning object. All fields are derived deterministically
 * from Layer 0 (SkyStateDaily) + Layer 1 (DailyFacts) inputs.
 * 
 * No window logic (yesterday/tomorrow) - that belongs in Phase 5.3.
 */
export const DailyInterpretationSchema = z.object({
  schema_version: z.string().min(1), // e.g., "1.0.0"
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  
  // Core meaning fields
  dominant_contrast_axis: DominantAxisSchema,
  why_today: z.array(z.string().min(1)).min(1).max(4), // Why this day matters
  why_today_clause: z.string().min(1), // Single sentence clause
  sky_anchors: z.array(SkyAnchorSchema).min(1).max(2), // Key astronomical anchors
  causal_logic: z.array(z.string().min(1)).min(1), // Causal reasoning chains
  
  // Supporting context
  supporting_themes: z.array(z.string().min(1)).max(8),
  tone_descriptor: z.string().min(1), // Overall tone/feeling
  
  // Signals and bundles
  signals: z.array(InterpretationSignalSchema).min(1),
  interpretation_bundles: z.object({
    primary: z.array(InterpretationBundleRefSchema),
    secondary: z.array(InterpretationBundleRefSchema),
    background: z.array(InterpretationBundleRefSchema),
  }),
  
  // Confidence and metadata
  confidence_level: z.enum(["high", "medium", "low"]),
  
  // Provenance
  provenance: z.object({
    sky_state_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sky_state_version: z.string().min(1).optional(),
    daily_facts_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    daily_facts_policy_version: z.string().min(1).optional(),
  }),
});

export type DailyInterpretation = z.infer<typeof DailyInterpretationSchema>;
export type DominantAxis = z.infer<typeof DominantAxisSchema>;
export type SkyAnchor = z.infer<typeof SkyAnchorSchema>;
export type InterpretationSignal = z.infer<typeof InterpretationSignalSchema>;
export type InterpretationBundleRef = z.infer<typeof InterpretationBundleRefSchema>;

