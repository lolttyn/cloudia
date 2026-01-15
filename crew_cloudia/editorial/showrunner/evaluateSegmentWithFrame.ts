import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { EditorFeedback } from "./editorContracts.js";

export function evaluateSegmentWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  segment_key: string;
  draft_script: string;
  attempt: number;
  max_attempts: number;
}): EditorFeedback {
  const notes: string[] = [];
  const rewrite_instructions: string[] = [];
  const blocking_reasons: string[] = [];
  const warnings: string[] = [];
  const scriptLower = params.draft_script.toLowerCase();
  const frame = params.interpretive_frame;
  const ingressSensitiveBodies = ["moon", "sun"];
  const ingressLanguagePattern = /\b(enter|enters|entering|ingress|approaching)\b/;
  const allowedAstroTokens = new Set<string>();
  for (const bundle of [
    ...(frame.interpretation_bundles?.primary ?? []),
    ...(frame.interpretation_bundles?.secondary ?? []),
  ]) {
    if (!bundle) continue;
    const tokens = [
      bundle.slug,
      bundle.trigger?.signal_key ?? "",
      bundle.title ?? "",
      bundle.summary ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    tokens.forEach((t) => allowedAstroTokens.add(t));
  }
  const astroEntities = [
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
    "conjunction",
    "conjunct",
    "square",
    "trine",
    "sextile",
    "opposition",
    "capricorn",
    "sagittarius",
    "virgo",
    "leo",
    "cancer",
    "libra",
    "scorpio",
    "taurus",
    "gemini",
    "aquarius",
    "pisces",
  ];

  const normalize = (value: unknown) =>
    typeof value === "string" ? value.toLowerCase() : String(value ?? "").toLowerCase();

  const entityPresentInSignalsOrSky = (entity: string): boolean => {
    const entityLower = entity.toLowerCase();
    const fromSignals = frame.signals.some((signal) => {
      if (normalize(signal.signal_key).includes(entityLower)) return true;
      if (signal.meta && typeof signal.meta === "object") {
        return normalize(JSON.stringify(signal.meta)).includes(entityLower);
      }
      return false;
    });

    const fromAnchors = frame.sky_anchors.some((anchor) =>
      normalize(anchor.label).includes(entityLower)
    );

    const fromWhyToday =
      frame.why_today.some((w) => normalize(w).includes(entityLower)) ||
      normalize(frame.why_today_clause).includes(entityLower);

    return fromSignals || fromAnchors || fromWhyToday;
  };

  // Temporal enforcement
  if (!scriptLower.includes(frame.temporal_phase.toLowerCase())) {
    const msg = `Temporal awareness: reference the temporal phase "${frame.temporal_phase}".`;
    notes.push(msg);
    rewrite_instructions.push(msg);
  }
  if (!scriptLower.includes(frame.intensity_modifier.toLowerCase())) {
    const msg = `Temporal awareness: include the intensity modifier "${frame.intensity_modifier}".`;
    notes.push(msg);
    rewrite_instructions.push(msg);
  }
  if (frame.temporal_arc.arc_day_index > 1) {
    const mustHook =
      (frame.continuity.references_yesterday &&
        scriptLower.includes(frame.continuity.references_yesterday.toLowerCase())) ||
      (frame.continuity.references_tomorrow &&
        scriptLower.includes(frame.continuity.references_tomorrow.toLowerCase()));
    if (!mustHook) {
      const msg = "Continuity: include at least one provided continuity hook for this arc day.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }
  if (frame.continuity.references_yesterday) {
    const hook = frame.continuity.references_yesterday.toLowerCase();
    if (!scriptLower.includes(hook)) {
      const msg = "Continuity: include the yesterday hook from the frame.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }
  if (frame.continuity.references_tomorrow) {
    const hook = frame.continuity.references_tomorrow.toLowerCase();
    if (!scriptLower.includes(hook)) {
      const msg = "Continuity: include the tomorrow hook from the frame.";
      notes.push(msg);
      rewrite_instructions.push(msg);
    }
  }

  // Phase D: Semantic check for axis meaning (not verbatim requirement)
  // The segment should orient toward the day's core tension, but can express it naturally
  const axisStatement = frame.dominant_contrast_axis.statement.toLowerCase();
  const axisPrimary = frame.dominant_contrast_axis.primary.toLowerCase();
  const axisCounter = frame.dominant_contrast_axis.counter.toLowerCase();
  
  // Check if the meaning is present semantically (either primary or counter concept appears)
  const hasAxisMeaning = scriptLower.includes(axisPrimary) || 
                         scriptLower.includes(axisCounter) ||
                         scriptLower.includes(axisStatement);
  
  if (!hasAxisMeaning) {
    // Downgrade to warning, not blocking - allow natural expression
    notes.push(
      `Meaning fidelity: the segment should orient toward the day's core tension (${axisPrimary} vs ${axisCounter}), but can express it in natural language.`
    );
    // Do NOT add to blocking_reasons - this is now a soft requirement
    // Do NOT add rewrite_instructions that require verbatim insertion
  }

  // Hard gate: astrological grounding (sky anchors + because + anchor tie)
  // Main themes: do not require sky anchor labels (Moon sign is banned for main_themes).
  if (params.segment_key !== "main_themes") {
    for (const anchor of frame.sky_anchors) {
      if (!scriptLower.includes(anchor.label.toLowerCase())) {
        const msg = `Astro grounding: reference sky anchor "${anchor.label}".`;
        notes.push(msg);
        rewrite_instructions.push(msg);
      }
    }

    // Ingress language must include the static anchor for ingress-sensitive bodies
    for (const anchor of frame.sky_anchors) {
      const labelLower = anchor.label.toLowerCase();
      const body = ingressSensitiveBodies.find((b) => labelLower.startsWith(`${b} in `));
      if (!body) continue;

      const bodyMentionedWithIngress =
        ingressLanguagePattern.test(scriptLower) && scriptLower.includes(body);

      if (bodyMentionedWithIngress && !scriptLower.includes(labelLower)) {
        const msg = `Ingress language detected for ${body} without static anchor "${anchor.label}".`;
        notes.push(msg);
        rewrite_instructions.push(`Include the exact anchor "${anchor.label}" when mentioning ${body} ingress.`);
        blocking_reasons.push(`segment:ingress_anchor_missing:${body}`);
      }
    }
  }

  if (!/\bbecause\b/i.test(params.draft_script)) {
    const msg = 'Astro grounding: include causal logic with the word "because".';
    notes.push(msg);
    rewrite_instructions.push(msg);
  }

  // Interpretation grounding: no astrological entities outside selected bundles
  for (const entity of astroEntities) {
    if (!scriptLower.includes(entity)) continue;

    const inBundles = Array.from(allowedAstroTokens).some((token) =>
      token.includes(entity)
    );
    const inSignalsOrSky = entityPresentInSignalsOrSky(entity);

    if (!inBundles && !inSignalsOrSky) {
      const msg = `Interpretation constraint: reference "${entity}" is not present in bundles, signals, or sky features.`;
      notes.push(msg);
      rewrite_instructions.push(msg);
      blocking_reasons.push("UNGROUNDED_INTERPRETATION");
    } else if (!inBundles && inSignalsOrSky) {
      const msg = `Warning: reference "${entity}" is grounded in signals/sky but not in selected bundles.`;
      warnings.push(msg);
    }
  }

  // Scaffold leakage guard: planner/interpreter artifacts should not ship.
  const scaffoldingPatterns = [
    { pattern: /\bsky anchor:/i, reason: "SCaffold:sky_anchor_label" },
    {
      pattern: /peaks today; exposure and decision points surface/i,
      reason: "SCaffold:planning_artifact",
    },
  ];
  for (const scaffold of scaffoldingPatterns) {
    if (scaffold.pattern.test(scriptLower)) {
      const msg = "Remove planner scaffolding; do not surface internal labels or templates.";
      notes.push(msg);
      rewrite_instructions.push(msg);
      blocking_reasons.push(scaffold.reason);
    }
  }

  // NOTE: Required headings removed per Phase D authority inversion.
  // These headings are now explicitly banned by the Phase D rubric.
  // Structural completeness is no longer enforced here; rubric is final authority.

  // NOTE: why_today and confidence_level checks removed per Phase D.
  // These were structural requirements that led to rubric scaffolding.
  // Rubric now enforces experiential quality, not structural completeness.

  const nextDecision = params.attempt + 1 >= params.max_attempts ? "FAIL_EPISODE" : "REVISE";

  // If we have blocking reasons, return them
  if (blocking_reasons.length > 0) {
    return {
      decision: nextDecision,
      notes: [...rewrite_instructions, ...warnings],
      blocking_reasons,
      rewrite_instructions,
    };
  }

  // No blocking reasons - approve
  return {
    decision: "APPROVE",
    notes: [...warnings],
    blocking_reasons: [],
    rewrite_instructions: [],
  };
}
