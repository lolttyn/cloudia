import { z } from "zod";

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const GENERIC_THEMES = [
  "transformation",
  "unity",
  "focus",
  "change",
  "growth",
  "alignment",
  "balance",
  "one",
];

const TEMPORAL_MARKERS = [
  "today",
  "brief transit",
  "short window",
  "first full day",
  "peaks today",
];

const SKY_BODY_PATTERN =
  /(sun|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)/i;
const SKY_CONDITION_PATTERN =
  /(in\s+[a-z]+|entering\s+[a-z]+|stationing?\s+retrograde|stationing?|retrograde|conjunction|conjunct|square|trine|opposition|opposing|sextile|quincunx|eclipse)/i;

const containsTemporalMarker = (text: string): boolean =>
  TEMPORAL_MARKERS.some((marker) => text.toLowerCase().includes(marker));

const containsBecause = (text: string): boolean => /\bbecause\b/i.test(text);

const isGenericTheme = (text: string): boolean =>
  GENERIC_THEMES.includes(text.trim().toLowerCase());

const isSingleSentence = (text: string): boolean => {
  const sentences = text
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.length <= 1;
};

export const SkyAnchorSchema = z
  .object({
    type: z.enum(["sun_sign", "moon_sign", "major_aspect"]),
    label: z.string().min(1),
    meaning: z.string().min(1),
  })
  .superRefine((anchor, ctx) => {
    const label = anchor.label.toLowerCase();
    if (!SKY_BODY_PATTERN.test(label) || !SKY_CONDITION_PATTERN.test(label)) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message:
          "sky anchor label must explicitly name a body and condition (e.g., 'Moon in Virgo')",
      });
    }
  });

export const InterpretiveFrameSchema = z
  .object({
    date: DateStringSchema,
    dominant_contrast_axis: z
      .object({
        statement: z
          .string()
          .min(1)
          .regex(/ over /i, "contrast statement must express X over Y"),
        primary: z.string().min(1),
        counter: z.string().min(1),
      })
      .superRefine((axis, ctx) => {
        const parts = axis.statement
          .toLowerCase()
          .split(/ over /i)
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length !== 2) {
          ctx.addIssue({
            code: "custom",
            path: ["statement"],
            message: "dominant axis must be expressed as 'X over Y'",
          });
        }

        // Reject contrasts that collapse to two generic abstractions.
        const bothGeneric = parts.length === 2 && parts.every(isGenericTheme);
        if (bothGeneric) {
          ctx.addIssue({
            code: "custom",
            path: ["statement"],
            message:
              "dominant axis must contrast experiential modes, not two generic abstractions",
          });
        }
      }),
    tone_descriptor: z.string().min(1),
    why_today: z.array(z.string().min(1)).min(1).max(4),
    supporting_themes: z.array(z.string().min(1)).max(8),
    sky_anchors: z.array(SkyAnchorSchema).min(1).max(2),
    causal_logic: z.array(z.string().min(1)).min(1),
    why_today_clause: z.string().min(1),
    temporal_phase: z.enum(["building", "peak", "releasing", "aftershock", "baseline"]),
    intensity_modifier: z.enum(["emerging", "strengthening", "dominant", "softening"]),
    continuity: z
      .object({
        references_yesterday: z.string().min(1).max(180).optional(),
        references_tomorrow: z.string().min(1).max(180).optional(),
      })
      .refine(
        (c) =>
          (c.references_yesterday ? isSingleSentence(c.references_yesterday) : true) &&
          (c.references_tomorrow ? isSingleSentence(c.references_tomorrow) : true),
        {
          message: "Continuity hooks must be at most one sentence each",
        }
    ),
  temporal_arc: z
    .object({
      type: z.enum(["retrograde", "lunar_phase", "major_aspect", "solar_ingress", "none"]),
      phase: z.string().min(1),
      intensity: z.enum(["emerging", "strengthening", "dominant", "softening"]),
      arc_day_index: z.number().int().min(1),
      arc_total_days: z.number().int().min(1),
    })
    .superRefine((arc, ctx) => {
      if (arc.arc_day_index > arc.arc_total_days) {
        ctx.addIssue({
          code: "custom",
          message: "arc_day_index cannot exceed arc_total_days",
          path: ["arc_day_index"],
        });
      }
      if (arc.type === "none" && arc.phase.toLowerCase() !== "baseline") {
        ctx.addIssue({
          code: "custom",
          message: "arc type 'none' must use phase 'baseline'",
          path: ["phase"],
        });
      }
    }),
    timing: z.object({
      state: z.enum(["building", "peaking", "settling", "transitioning"]),
      notes: z.string().min(1).optional(),
    }),
    confidence_level: z.enum(["high", "medium", "low"]),
    canon_compliance: z.object({
      violations: z.array(z.string().min(1)),
      notes: z.array(z.string().min(1)),
    }),
  })
  .superRefine((frame, ctx) => {
    const anchorLabels = frame.sky_anchors.map((a) => a.label.toLowerCase());

    // Require explicit causal linkage using "because".
    const hasBecause = frame.causal_logic.some(containsBecause);
    if (!hasBecause) {
      ctx.addIssue({
        code: "custom",
        path: ["causal_logic"],
        message: "causal_logic must include a sentence with 'because'",
      });
    }

    const causalReferencesAnchor = frame.causal_logic.some((line) => {
      const lower = line.toLowerCase();
      return anchorLabels.some((label) => lower.includes(label)) || SKY_BODY_PATTERN.test(lower);
    });
    if (!causalReferencesAnchor) {
      ctx.addIssue({
        code: "custom",
        path: ["causal_logic"],
        message: "causal_logic must tie meaning directly to a named sky anchor",
      });
    }

    // Require temporal specificity for "why today".
    const temporalSources = [frame.why_today_clause, ...frame.why_today];
    if (!temporalSources.some(containsTemporalMarker)) {
      ctx.addIssue({
        code: "custom",
        path: ["why_today"],
        message:
          "frame must explain why it applies today (e.g., 'today', 'brief transit', 'short window', 'first full day', 'peaks today')",
      });
    }

    // Reject generic themes when they appear ungrounded in tone or supporting themes.
    if (isGenericTheme(frame.tone_descriptor)) {
      ctx.addIssue({
        code: "custom",
        path: ["tone_descriptor"],
        message:
          "tone_descriptor cannot be a generic theme without contrast or causal grounding",
      });
    }

    frame.supporting_themes.forEach((theme, idx) => {
      if (isGenericTheme(theme)) {
        ctx.addIssue({
          code: "custom",
          path: ["supporting_themes", idx],
          message:
            "supporting themes must be specific and grounded, not generic symbols",
        });
      }
    });
  });

export type InterpretiveFrame = z.infer<typeof InterpretiveFrameSchema>;

