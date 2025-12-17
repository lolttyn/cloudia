# sky_state: Canonical Layer 0 Output Contract

## Purpose
sky_state is the canonical, deterministic JSON output produced by Layer 0 ephemeris computation. It is transport- and vendor-agnostic. It carries no interpretation. It exists so downstream layers can rely on a stable, validated snapshot of astronomical state.

## Non-Negotiable Design Principles
- Deterministic: same inputs and data version yield the same sky_state.
- Explicit: no implied defaults; absent data must be omitted, not inferred.
- Minimal: only astronomy/state, never interpretation or business logic.
- Validated: schema-conformant or it fails; no best-effort recovery.
- Traceable: data_version and computation metadata must be present.

## Canonical JSON Example
```
{
  "schema_version": "1.0.0",
  "meta": {
    "data_version": "swiss-ephemeris-2.10.03",
    "engine": "swisseph",
    "engine_version": "2.10.03",
    "timestamp_generated": "2024-01-02T03:04:05.678Z"
  },
  "timestamp": "2024-01-02T03:04:05.678Z",
  "bodies": {
    "sun": { "ra": 0.123456, "dec": -0.234567, "distance_au": 0.99999 },
    "moon": { "ra": 1.234567, "dec": 0.345678, "distance_au": 0.00257 },
    "mercury": { "ra": 2.345678, "dec": -0.456789, "distance_au": 0.722 },
    "venus": { "ra": 3.456789, "dec": 0.56789, "distance_au": 0.72 },
    "mars": { "ra": 4.56789, "dec": -0.6789, "distance_au": 1.52 },
    "jupiter": { "ra": 5.6789, "dec": 0.789, "distance_au": 5.2 },
    "saturn": { "ra": 0.789, "dec": -0.12, "distance_au": 9.5 },
    "uranus": { "ra": 1.89, "dec": 0.21, "distance_au": 19.2 },
    "neptune": { "ra": 2.98, "dec": -0.05, "distance_au": 30.1 },
    "pluto": { "ra": 3.12, "dec": -0.11, "distance_au": 34.8 }
  },
  "aspects": [
    { "body_a": "sun", "body_b": "moon", "type": "conjunction", "orb_deg": 0.12 },
    { "body_a": "mercury", "body_b": "venus", "type": "sextile", "orb_deg": 0.34 }
  ],
  "lunar": {
    "phase_name": "waxing_gibbous",
    "phase_angle_deg": 101.23,
    "illumination_pct": 78.9
  }
}
```

## Field Definitions (Top-Level)
- `schema_version` (string, required): Semantic version of the sky_state schema. Changes only per rules below.
- `meta` (object, required): Metadata about data and computation.
  - `data_version` (string, required): Identifier of the ephemeris data set used (e.g., swiss-ephemeris-2.10.03).
  - `engine` (string, required): Name of the computation engine (e.g., swisseph).
  - `engine_version` (string, required): Version of the computation engine.
  - `timestamp_generated` (ISO 8601 string, required): When the sky_state was produced.
- `timestamp` (ISO 8601 string, required): The instant for which the sky_state positions are computed.
- `bodies` (object, required): Map of body name → state.
  - Each body entry:
    - `ra` (number, required): Right ascension in radians.
    - `dec` (number, required): Declination in radians.
    - `distance_au` (number, required): Distance from Earth in astronomical units.
- `aspects` (array of objects, required but may be empty): Pairwise relationships between bodies.
  - Each aspect entry:
    - `body_a` (string, required): Body name in the `bodies` map.
    - `body_b` (string, required): Body name in the `bodies` map.
    - `type` (string, required): Aspect type label (e.g., conjunction, opposition, square, trine, sextile).
    - `orb_deg` (number, required): Orbital separation difference from exact aspect, in degrees.
- `lunar` (object, required):
  - `phase_name` (string, required): Canonical lunar phase label (e.g., new, waxing_crescent, first_quarter, waxing_gibbous, full, waning_gibbous, last_quarter, waning_crescent).
  - `phase_angle_deg` (number, required): Sun–Moon elongation angle in degrees.
  - `illumination_pct` (number, required): Percent illumination of the lunar disc.

## Explicit Exclusions
- No interpretation, meanings, or textual narratives.
- No houses, angles, lots, or topical astrology constructs.
- No timezone-dependent formatting beyond the provided ISO timestamp.
- No unit polymorphism: RA/Dec are radians, distances are AU, orbs are degrees.
- No hidden defaults or derived fallbacks; absent data must be omitted, not invented.
- No probabilistic outputs or heuristics; values must come from deterministic computation.

## Schema Versioning and Change Rules
- `schema_version` follows semver.
- Breaking changes (field removals, type changes, required → optional, meaning shifts) require a major version increment.
- Additive, backward-compatible fields require a minor version increment.
- Patch versions are reserved for clarifications that do not alter structure, requirements, or meanings.
- Once a schema version is published, it is immutable; prior versions remain valid for their declared contract.

