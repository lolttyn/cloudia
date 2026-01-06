/**
 * Phase 5.1 Error Model
 * Explicit errors for missing Layer 0/1 inputs
 */

export class MissingSkyStateError extends Error {
  constructor(public date: string) {
    super(`Missing sky_state_daily for ${date}`);
    this.name = "MissingSkyStateError";
  }
}

export class MissingDailyFactsError extends Error {
  constructor(public date: string) {
    super(`Missing daily_facts for ${date}`);
    this.name = "MissingDailyFactsError";
  }
}

