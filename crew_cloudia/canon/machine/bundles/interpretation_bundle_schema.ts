// crew_cloudia/canon/machine/bundles/interpretation_bundle_schema.ts
import { z } from "zod";

/**
 * Interpretation bundles are canonized meaning “atoms” that map from factual sky signals
 * (e.g., SATURN square MERCURY) to broadcast-safe interpretive content.
 *
 * These are DATA (immutable once published), not prompts.
 */

export const Speakability = z.enum(["must_say", "can_say", "avoid"]);

export const BundleKind = z.enum([
  "aspect",          // planet-to-planet aspect, e.g., saturn_square_mercury
  "planet_in_sign",  // environmental placement, e.g., venus_in_scorpio
  "cycle",           // retrogrades, stations, eclipse season
  "lunar_overlay",   // optional composite like full_moon_square_uranus
]);

export const BundleTrigger = z.object({
  /**
   * A canonical key that matches what Layer 1/2 emits.
   * Keep it stable: e.g. "saturn_square_mercury"
   */
  signal_key: z.string().min(1),

  /**
   * Optional constraints for selection:
   * - orb_max_degrees for aspects
   * - min_salience, etc.
   * Keep optional so older bundles don’t break.
   */
  constraints: z
    .object({
      orb_max_degrees: z.number().positive().optional(),
      min_salience: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const BundleMeaning = z.object({
  /**
   * One sentence. Broadcastable. No mysticism. No fate claims.
   */
  headline: z.string().min(1),

  /**
   * A small set of “truths” that can be selected by the editor.
   * Each has speakability to control what gets used.
   */
  frames: z.array(
    z.object({
      speakability: Speakability,
      text: z.string().min(1),
    })
  ),

  /**
   * Specific friction patterns that commonly show up with this signal.
   * Keep concrete and behaviorally legible.
   */
  frictions: z.array(z.string().min(1)).max(8),

  /**
   * Specific opportunities this signal supports if handled well.
   */
  opportunities: z.array(z.string().min(1)).max(8),
});

export const BundleGuidance = z.object({
  /**
   * “Do” items are practical behaviors or micro-rituals.
   */
  do: z.array(z.string().min(1)).max(10),

  /**
   * “Avoid” items are failure modes to explicitly warn against.
   */
  avoid: z.array(z.string().min(1)).max(10),

  /**
   * Optional: short scripts the voice layer can reuse as lines.
   * Still not “prose”; think broadcast fragments.
   */
  reusable_lines: z
    .array(
      z.object({
        speakability: Speakability,
        text: z.string().min(1),
      })
    )
    .optional(),
});

export const BundleSafety = z.object({
  /**
   * Explicit guardrails to prevent predictive or deterministic claims.
   */
  forbidden_claims: z.array(z.string().min(1)).min(1),

  /**
   * Allowed framing that communicates uncertainty properly.
   */
  allowed_framing: z.array(z.string().min(1)).min(1),
});

export const InterpretationBundleSchema = z.object({
  id: z.string().uuid().optional(), // optional; can be added later
  slug: z.string().min(1),          // e.g. "saturn_square_mercury"
  version: z.number().int().min(1), // v1 => 1
  kind: BundleKind,

  title: z.string().min(1),
  summary: z.string().min(1).max(400),

  trigger: BundleTrigger,
  meaning: BundleMeaning,
  guidance: BundleGuidance,
  safety: BundleSafety,

  /**
   * Tags are for internal selection / continuity suppression.
   * Keep them sparse and canonical.
   */
  tags: z.array(z.string().min(1)).max(20).default([]),

  /**
   * Optional: citations / influences for auditability (not required).
   * Keep to short strings (book names, schools, etc.).
   */
  sources: z.array(z.string().min(1)).max(10).optional(),
});

export type InterpretationBundle = z.infer<typeof InterpretationBundleSchema>;
