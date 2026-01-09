import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { buildIntroScaffold } from "../../generation/introScaffold.js";

const INGRESS_SENSITIVE_BODIES = ["moon", "sun"];
const INTENSITY_CUES: Record<string, string[]> = {
  emerging: ["calm", "spacious", "gentle", "fresh", "opening"],
  strengthening: ["gathering", "rising", "stirring", "picking up", "sharpening"],
  dominant: ["vivid", "charged", "immediate", "center-stage", "alive"],
  softening: ["easing", "unwinding", "integrating", "settling", "exhale"],
};

export function buildRewritePrompt(params: {
  original_script: string;
  blocking_reasons: string[];
  interpretive_frame?: InterpretiveFrame;
  segment_key?: string;
  episode_date?: string;
}): string {
  const ingressAnchorDirectives: string[] = [];

  if (params.interpretive_frame) {
    for (const anchor of params.interpretive_frame.sky_anchors) {
      const labelLower = anchor.label.toLowerCase();
      const body = INGRESS_SENSITIVE_BODIES.find((b) => labelLower.startsWith(`${b} in `));
      if (!body) continue;

      const blocksAnchor = params.blocking_reasons.some((reason) => {
        const lower = reason.toLowerCase();
        return lower.includes(labelLower) || (lower.includes("ingress") && lower.includes(body));
      });

      if (blocksAnchor) {
        ingressAnchorDirectives.push(`- You must include the exact phrase: "${anchor.label}"`);
      }
    }
  }

  const ingressAnchorBlock =
    ingressAnchorDirectives.length > 0
      ? `\nIngress-sensitive anchors (must appear verbatim):\n${ingressAnchorDirectives.join("\n")}\n`
      : "";

  const lockedScaffold =
    params.segment_key === "intro" &&
    params.interpretive_frame &&
    params.episode_date
      ? buildIntroScaffold({
          episode_date: params.episode_date,
          axis_primary: params.interpretive_frame.dominant_contrast_axis.primary,
          axis_counter: params.interpretive_frame.dominant_contrast_axis.counter,
          why_today_clause: params.interpretive_frame.why_today_clause,
        })
      : undefined;

  const scaffoldFence = lockedScaffold
    ? `
The intro scaffold below is LOCKED. Copy it verbatim. Do NOT edit, paraphrase, merge, or delete it. You may only rewrite the expressive sentences that come AFTER the locked scaffold. Return the full intro as: locked scaffold + EXACTLY two expressive sentences.

--- BEGIN LOCKED SCAFFOLD ---
${lockedScaffold}
--- END LOCKED SCAFFOLD ---
`
    : "";

  const intensity = params.interpretive_frame?.intensity_modifier?.toLowerCase();
  const intensityCues = intensity ? INTENSITY_CUES[intensity] ?? [] : [];
  const intensityBlock =
    intensityCues.length > 0
      ? `\nIntensity tone cues for today (${intensity}): ${intensityCues.join(", ")}.\nUse tone and word choice only. Do NOT explain intensity, arcs, or phases. Do NOT mention yesterday or tomorrow.\n`
      : "";

  return `
The previous version of this segment failed editorial checks.

Blocking issues:
${params.blocking_reasons.map((r) => `- ${r}`).join("\n")}

Rewrite the segment to fix ONLY the issues listed above.

Rules:
- Do not introduce new themes, claims, or sections.
- Preserve tone and voice.
- Ensure all required sections are present.
- Do not add predictions or advice.
- Return the full revised segment text only.
${scaffoldFence}${ingressAnchorBlock}${intensityBlock}`.trim();
}

