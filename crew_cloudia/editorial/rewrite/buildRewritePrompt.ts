export function buildRewritePrompt(params: {
  original_script: string;
  blocking_reasons: string[];
}): string {
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
`;
}

