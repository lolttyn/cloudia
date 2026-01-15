# sky_state: Canonical Layer 0 Output Contract

## Purpose
sky_state is the canonical, deterministic JSON output produced by Layer 0 ephemeris computation. It is transport- and vendor-agnostic. It carries no interpretation. It exists so downstream layers can rely on a stable, validated snapshot of astronomical state.

## Non-Negotiable Design Principles
- Deterministic: same inputs and data version yield the same sky_state.
- Explicit: no implied defaults; absent data must be omitted, not inferred.
- Minimal: only astronomy/state, never interpretation or business logic.
- Validated: schema-conformant or it fails; no best-effort recovery.
- Traceable: data_version and computation metadata must be present.

## Canonical JSON Example (v1.1.0)
```
{
  "schema_version": "1.1.0",
  "meta": {
    "engine": "swisseph",
    "engine_version": "unversioned",
    "ephemeris_fileset": "unversioned",
    "coordinate_system": "tropical",
    "timestamp_generated": "2024-01-02T12:00:00.000Z"
  },
  "timestamp": {
    "date": "2024-01-02",
    "utc_datetime": "2024-01-02T12:00:00.000Z",
    "timezone": "UTC",
    "julian_day": 2460312.0
  },
  "bodies": {
    "sun": {
      "longitude": 281.5,
      "latitude": 0.0,
      "distance_au": 0.984,
      "speed_deg_per_day": 1.0,
      "retrograde": false,
      "sign": "capricorn",
      "sign_degree": 11.5
    },
    "moon": {
      "longitude": 45.2,
      "latitude": 2.3,
      "distance_au": 0.00257,
      "speed_deg_per_day": 13.2,
      "retrograde": false,
      "sign": "taurus",
      "sign_degree": 15.2
    },
    "mercury": {
      "longitude": 320.1,
      "latitude": -1.2,
      "distance_au": 0.722,
      "speed_deg_per_day": -0.5,
      "retrograde": true,
      "sign": "aquarius",
      "sign_degree": 20.1
    }
  },
  "aspects": [],
  "lunar": {}
}
```

## Field Definitions (Top-Level)
- `schema_version` (string, required): Semantic version of the sky_state schema. Changes only per rules below.
- `meta` (object, required): Metadata about data and computation.
  - `engine` (string, required): Name of the computation engine (e.g., "swisseph").
  - `engine_version` (string, required): Version of the computation engine. May be "unversioned" until version detection is implemented.
  - `ephemeris_fileset` (string, required): Identifier of the ephemeris data set used (e.g., "swiss-ephemeris-2.10.03"). May be "unversioned" until version detection is implemented.
  - `coordinate_system` (string, required): Coordinate system used (e.g., "tropical" for tropical ecliptic).
  - `timestamp_generated` (ISO 8601 string, required): When the sky_state was produced (ISO 8601 UTC).
- `timestamp` (object, required): The instant for which the sky_state positions are computed.
  - `date` (string, required): Date in YYYY-MM-DD format.
  - `utc_datetime` (ISO 8601 string, required): Full UTC datetime (ISO 8601).
  - `timezone` (string, required): Timezone identifier (currently always "UTC").
  - `julian_day` (number, required): Julian Day number (float, includes fractional day).
- `bodies` (object, required): Map of body name → state. Bodies: sun, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto.
  - Each body entry:
    - `longitude` (number, required): Ecliptic longitude in degrees (0-360).
    - `latitude` (number, optional): Ecliptic latitude in degrees. Omitted if not computed.
    - `distance_au` (number, optional): Distance from Earth in astronomical units. Omitted if not computed.
    - `speed_deg_per_day` (number, required): Longitudinal speed in degrees per day.
    - `retrograde` (boolean, required): True if body is retrograde (negative speed).
    - `sign` (string, required): Zodiac sign name (lowercase: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces).
    - `sign_degree` (number, required): Degree within the sign (0-30).
- `aspects` (array of objects, required but may be empty): Pairwise relationships between bodies. Currently empty; reserved for future implementation.
  - Each aspect entry (when implemented):
    - `body_a` (string, required): Body name in the `bodies` map.
    - `body_b` (string, required): Body name in the `bodies` map.
    - `type` (string, required): Aspect type label (e.g., conjunction, opposition, square, trine, sextile).
    - `orb_deg` (number, required): Orbital separation difference from exact aspect, in degrees.
- `lunar` (object, required): Lunar phase data. Currently empty object; reserved for future implementation.
  - `phase_name` (string, required): Canonical lunar phase label (e.g., new, waxing_crescent, first_quarter, waxing_gibbous, full, waning_gibbous, last_quarter, waning_crescent).
  - `elongation_deg` (number, required in v1.1.0): **Directed** Sun→Moon elongation in degrees, normalized to \([0, 360)\), computed as \((moon\_lon - sun\_lon + 360) \% 360\).
  - `phase_angle_abs_deg` (number, required in v1.1.0): Absolute smallest separation in degrees, normalized to \([0, 180]\), computed as \(min(elongation, 360 - elongation)\).
  - `phase_angle_deg` (number, required): Back-compat alias for `phase_angle_abs_deg` (absolute smallest separation in degrees, \([0, 180]\)).
  - `illumination_pct` (number, required): Percent illumination of the lunar disc.

## Explicit Exclusions
- No interpretation, meanings, or textual narratives.
- No houses, angles, lots, or topical astrology constructs.
- No timezone-dependent formatting beyond the provided ISO timestamp.
- No unit polymorphism: longitudes/latitudes are degrees, distances are AU, orbs are degrees.
- No hidden defaults or derived fallbacks; absent data must be omitted, not invented.
- No probabilistic outputs or heuristics; values must come from deterministic computation.

## Coordinate System (v1.0.0)
- **System**: Tropical ecliptic coordinates
- **Longitude**: Measured along the ecliptic from the vernal equinox (0° = Aries 0°)
- **Latitude**: Perpendicular distance from the ecliptic plane (degrees)
- **Sign derivation**: Sign and sign_degree are coordinate transforms (longitude / 30), not interpretations
- **Reference frame**: Geocentric, computed at 12:00:00 UTC for the given date

## Schema Versioning and Change Rules
- `schema_version` follows semver.
- Breaking changes (field removals, type changes, required → optional, meaning shifts) require a major version increment.
- Additive, backward-compatible fields require a minor version increment.
- Patch versions are reserved for clarifications that do not alter structure, requirements, or meanings.
- Once a schema version is published, it is immutable; prior versions remain valid for their declared contract.

