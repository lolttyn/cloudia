## Layered Model
- **Layer 0 — Astronomical data:** Swiss Ephemeris source available for upstream calculations.
- **Layer 1 — Astrological facts:** Structured facts derived from ephemeris data (inputs assumed from upstream planner).
- **Layer 2 — Interpretation:** Thematic meanings assembled from facts; shaped by editorial plans.
- **Layer 3 — Editorial governance:** Segment writing contracts define required sections, forbidden elements, length, and formatting rules.
- **Layer 4 — Voice (Cloudia):** Expressive layer that must satisfy obligations without structural markup for semantic sections.

Layers 0–3 are structural and explicit; Layer 4 is expressive while still bounded by contracts.

## Validated Surface (current)
- Intro and main_themes segments generated via `generateSegmentDraft` using provided plans and contracts.
- Structural vs semantic required-section enforcement works with normalized matching (case/spacing/punctuation) for structural keys.
- Single-pass LLM invocation; no retries or fallbacks in the generation module.
- Local runners support inspection; no automated gating or publishing.

## Enforcement Philosophy
- Contracts precede creativity: structural obligations are machine-enforced; semantic obligations are tracked but judged by humans or later scorers.
- Violations and flags are signals, not silent corrections. The generator reports; it does not rewrite or retry.
- Normalization for structural checks aligns human-readable headers with machine keys without loosening requirements.

## Showrunner Authority
- Layer 4 (Cloudia) earns freedom once upstream obligations are met. Semantic sections need conceptual coverage, not explicit labels.
- Structural labels are confined to layers that require legibility and auditability (Layers 1–3).
- This separation preserves voice while maintaining governance and explainability.

## Not Built (by design)
- Editorial approval gate.
- Persistence/versioning of drafts.
- Automation/scheduling of runs.
- Publishing pipeline.

