# Layer 0 — Native Ephemeris Boundary

This directory defines the **native boundary** for astronomical computation.

## Rules

- Thin wrapper only
- No astrology logic
- No interpretation
- No caching
- Deterministic inputs → deterministic outputs

## Contract

All astronomical computation must flow through:

- `astro/computeSkyState.ts`

No other part of the codebase may compute or infer sky state directly.

## Status

Native bindings are **not yet implemented**.
This directory exists to lock the architectural boundary.

