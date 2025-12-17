# ADR-002: Swiss Ephemeris Strategy (Phase 2 pre-commit)

- **Status**: Proposed
- **Context**: Phase 2 will introduce Swiss Ephemeris as Layer 0. We must lock licensing, inputs, and determinism before any integration work.
- **Decision**:
  - Copyleft path chosen (AGPL-style) for the ephemeris layer and downstream usage.
  - Swiss Ephemeris is the authoritative Layer 0 source.
  - `.se1` ephemeris data files are required inputs; they are data artifacts, not code.
  - Ephemeris data files are versioned artifacts; specific versions must be pinned and tracked.
  - Determinism is non-negotiable; given the same inputs and data version, outputs must be reproducible.
  - No astrology/business logic is allowed in Layer 0; it is pure ephemeris computation only.
- **Consequences**:
  - Repository must keep ephemeris data out of source control unless explicitly pinned as artifacts.
  - Build/runtime must accept `SWEPH_PATH` (or equivalent) to locate data files; absence should fail fast in Phase 2.
  - Any future helpers (downloads, caching, retries) must respect deterministic, pinned data and licensing.
  - Higher layers remain responsible for astrology logic; Layer 0 stays transport/data/compute only.
- **Notes**:
  - This ADR blocks re-litigating the source/library choice “just to try something.”
  - Integration (transport, data acquisition, tooling) is deferred until the canonical `sky_state` schema is locked.

