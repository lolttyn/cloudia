import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

const INGRESS_SENSITIVE_BODIES = ["moon", "sun"];

export function buildRewritePrompt(params: {
  original_script: string;
  blocking_reasons: string[];
  interpretive_frame?: InterpretiveFrame;
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
      ? `\nIngress-sensitive anchors:\n${ingressAnchorDirectives.join("\n")}\n`
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
${ingressAnchorBlock}`;
}

