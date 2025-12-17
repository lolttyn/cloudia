## Cloudia Editorial Gate Policy (v0.1)

### Purpose
- Single question: does this segment ship, and if not, why?
- Gate enforces standards; it does not rewrite, negotiate, or optimize engagement.

### Scope
- Evaluates final draft scripts before recording, TTS, publishing, or marking ready.
- Generation may succeed while the gate rejects; rejection is expected behavior.

### Inputs
- Draft script produced by generation.
- Segment metadata: segment_key, intent, date, tags, constraints.
- Writing contract for the segment (required sections, forbidden elements, length, formatting).
- Validation context (canon/fact checks from upstream when available).
- Policy version (this document).

### Outputs
- Decision: approved / rejected.
- Violations classified (blocking vs rewrite-eligible) with reasons.
- Warnings logged.
- Policy version used.
- Rewrite history (if any) linked to attempts; nothing is overwritten.

### Decision Matrix
1) Detect violations and warnings.
2) Classify each finding:
   - Blocking: hard stop; requires human override to ship.
   - Rewrite-eligible: correction allowed only if policy permits (future-dated mode); no auto-loop.
   - Warning: informational; no effect on shipping.
   - Ignored signal: logged but inert to avoid false authority.
3) Apply time sensitivity:
   - Day-of episodes: blocking = stop; rewrite-eligible = do not rewrite; warnings logged.
   - Future-dated: blocking = stop; rewrite-eligible = bounded rewrites (cap, target specific issues, no new violations); warnings logged/tracked.
4) Finalize decision:
   - Ships only if no blocking violations and rewrite rules (if invoked) are satisfied.
   - Otherwise rejected; record reasons and status.

### Classification Reference
- Blocking violations (cannot ship): canon violations, astronomical incorrectness, structural failure in governed segments, banned language/framing, segment schema mismatch.
- Rewrite-eligible (conditional): weak clarity of primary theme, redundancy, underdeveloped example, tone drift within allowed bounds, minor structural imbalance.
- Warnings (informational): mild repetition, generic phrasing, missed specificity, non-critical stylistic deviation.
- Ignored signals: diagnostics that cannot be acted on deterministically or would cause churn; logged only.

### Time Sensitivity Rules
- Day-of (strict): blocking = hard stop; rewrite-eligible = no rewrite; warnings logged.
- Future-dated (flexible): blocking = hard stop; rewrite-eligible = up to N bounded rewrites; warnings logged/tracked; failed rewrites freeze as failed.

### Segment-Specific Enforcement (examples)
- intro: high semantic freedom; low structural enforcement; canon/fact correctness mandatory.
- main_themes: structural rigor; required arcs/examples; no poetic evasion.
- closing: tone enforcement; no new claims; no escalation of certainty.
- Gate always uses the segment’s contract as authority.

### Persistence Rules
- Every decision is persisted with pass/fail, blocking reasons, warnings, rewrite history, and policy version.
- Nothing is overwritten; failure remains part of record.

### Human Override
- Allowed only explicitly; override reason is recorded; policy is not silently bypassed.
- Overrides are signals to refine policy, not conveniences.

### Forbidden by Policy
- Automatic retries without policy approval.
- “One more pass” loops.
- Quality judgments inside generation.
- Hiding failures or treating blockers as suggestions.
- Treating warnings as blockers.

### Definition of “Ships”
- No blocking violations.
- Rewrite rules satisfied if invoked.
- Gate marks approved.
- Eligible for recording/publishing steps.

### Rationale
- Editorial authority is deterministic and external to the model: the model proposes; the gate disposes.
- Violations and warnings are signals, not self-healing actions.
- Conservatism is intentional to preserve governance and explainability.

