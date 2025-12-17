export function mapDiagnosticsToEditorialViolations(input: {
  canon_violations?: string[];
  astro_violations?: string[];
  structural_violations?: string[];
  tone_issues?: string[];
  repetition_flags?: string[];
  other_warnings?: string[];
}): {
  blocking_violations: string[];
  rewrite_eligible_violations: string[];
  warnings: string[];
  ignored: string[];
} {
  const canon = input.canon_violations ?? [];
  const astro = input.astro_violations ?? [];
  const structural = input.structural_violations ?? [];
  const tone = input.tone_issues ?? [];
  const repetition = input.repetition_flags ?? [];
  const otherWarnings = input.other_warnings ?? [];

  return {
    blocking_violations: [...canon, ...astro, ...structural],
    rewrite_eligible_violations: [...tone, ...repetition],
    warnings: [...otherWarnings],
    ignored: [],
  };
}

