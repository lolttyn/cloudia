export type TimeContext = "day_of" | "future";

export interface EditorialGateInput {
  episode_id: string;
  episode_date: string;
  segment_key: string;
  time_context: TimeContext;

  generated_script: string;

  diagnostics: {
    blocking_violations: string[]; // violation IDs
    rewrite_eligible_violations: string[];
    warnings: string[];
    ignored: string[];
  };

  segment_contract: {
    allows_rewrites: boolean;
  };

  policy_version: string;

  max_attempts_remaining?: number;
}

export interface EditorialGateResult {
  decision: "approve" | "block" | "rewrite";
  is_approved: boolean;

  blocking_reasons: string[];

  rewrite_instructions?: {
    target_violations: string[];
    guidance: string;
    max_attempts_remaining: number;
  };

  warnings: string[];

  policy_version: string;
  evaluated_at: string;
}

export function evaluateEditorialGate(
  input: EditorialGateInput
): EditorialGateResult {
  const evaluatedAt = new Date().toISOString();

  const blockingViolations = [...input.diagnostics.blocking_violations];
  const warnings = [...input.diagnostics.warnings];

  if (blockingViolations.length > 0) {
    return {
      decision: "block",
      is_approved: false,
      blocking_reasons: blockingViolations,
      warnings,
      policy_version: input.policy_version,
      evaluated_at: evaluatedAt
    };
  }

  if (input.time_context === "day_of") {
    return {
      decision: "approve",
      is_approved: true,
      blocking_reasons: [],
      warnings,
      policy_version: input.policy_version,
      evaluated_at: evaluatedAt
    };
  }

  const rewriteEligibleViolations = [
    ...input.diagnostics.rewrite_eligible_violations
  ];
  const maxAttemptsRemaining = input.max_attempts_remaining ?? 0;

  if (
    input.time_context === "future" &&
    input.segment_contract.allows_rewrites === true &&
    rewriteEligibleViolations.length > 0 &&
    maxAttemptsRemaining > 0
  ) {
    return {
      decision: "rewrite",
      is_approved: false,
      blocking_reasons: [],
      rewrite_instructions: {
        target_violations: rewriteEligibleViolations,
        guidance:
          "Fix the listed violations only. Do not introduce new claims, facts, or framing.",
        max_attempts_remaining: maxAttemptsRemaining - 1
      },
      warnings,
      policy_version: input.policy_version,
      evaluated_at: evaluatedAt
    };
  }

  return {
    decision: "approve",
    is_approved: true,
    blocking_reasons: [],
    warnings,
    policy_version: input.policy_version,
    evaluated_at: evaluatedAt
  };
}

