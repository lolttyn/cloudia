# Layer 1: Technician — Astrological Facts Extraction

## Purpose

The Technician is Layer 1 of Cloudia's architecture. It transforms Layer 0 `sky_state` (pure astronomical data) into Layer 1 `daily_facts` (deterministic astrological facts). The Technician applies policy-driven filtering and classification to produce a clean, structured set of facts organized into three buckets: `transits_primary`, `transits_secondary`, and `background_conditions`.

## What Is a Fact vs Interpretation

### Facts (Layer 1)

A **fact** is a deterministic, policy-governed statement about astronomical state that has astrological relevance:

- ✅ "Mars forms a square with Saturn with 3.1° orb" (aspect transit)
- ✅ "Mercury is retrograde" (retrograde condition)
- ✅ "Sun ingresses into Capricorn" (ingress condition)
- ✅ "New Moon in Aquarius" (lunation condition)

Facts are:
- **Computable**: Derived directly from `sky_state` using mathematical rules
- **Policy-governed**: Only included if they meet the technician policy criteria
- **Classified**: Assigned to primary/secondary/background buckets based on orb thresholds and fact type
- **Traceable**: Every exclusion is recorded in `excluded` array

### Not Facts (Interpretation — Layer 2+)

These are **not** facts and belong to interpretation layers:

- ❌ "Mars square Saturn creates tension" (psychological interpretation)
- ❌ "Mercury retrograde disrupts communication" (causal assertion)
- ❌ "This aspect will cause problems" (predictive claim)
- ❌ "Sun in Capricorn brings structure" (meaning assignment)

## Layer 1 Is Selection + Classification, Not "All Positions"

**Critical constraint**: Layer 1 does **not** duplicate Layer 0 body position data.

Instead:
- Layer 1 references the source `sky_state` via the `source` field
- Layer 1 only includes body data when it's **part of a fact** (e.g., an ingress fact mentions which body and sign)
- Body positions are available in the referenced `sky_state`; they don't need to be restated

This prevents:
- Data duplication and storage bloat
- Potential mismatches between Layer 0 and Layer 1
- Inviting downstream layers to re-derive what should be sourced

## Bucket Semantics

Layer 1 outputs three **separate buckets**, not one array with salience flags. This structure prevents downstream layers from re-bucketing and ensures deterministic selection.

### `transits_primary[]`

Contains aspect transit facts with **primary salience**:
- Aspects where `orb_deg <= primary_max_deg` for that aspect type
- These are the tightest, most exact aspects
- Typically orbs ≤ 6-8° depending on aspect type

**Examples:**
```json
{
  "body_a": "mars",
  "body_b": "saturn",
  "aspect_type": "square",
  "orb_deg": 2.5,
  "is_exact": false
}
```

### `transits_secondary[]`

Contains aspect transit facts with **secondary salience**:
- Aspects where `orb_deg` falls between `primary_max_deg` and `secondary_max_deg`
- These are valid aspects but with larger orbs
- Typically orbs between 6-8° and 8-10° depending on aspect type

**Examples:**
```json
{
  "body_a": "venus",
  "body_b": "jupiter",
  "aspect_type": "trine",
  "orb_deg": 9.2,
  "is_exact": false
}
```

### `background_conditions[]`

Contains **non-aspect condition facts**:
- Retrograde conditions (`retrograde`)
- Sign ingress conditions (`ingress`)
- Lunation conditions (`lunation`)
- Background aspects (only if `include_background_aspects` is `true` in policy)

**Examples:**
```json
// Retrograde
{
  "kind": "retrograde",
  "body": "mercury"
}

// Ingress
{
  "kind": "ingress",
  "body": "sun",
  "from_sign": "sagittarius",
  "to_sign": "capricorn"
}

// Lunation
{
  "kind": "lunation",
  "phase": "new",
  "sign": "aquarius"
}

// Background aspect (if enabled)
{
  "kind": "aspect",
  "body_a": "mars",
  "body_b": "jupiter",
  "aspect_type": "sextile",
  "orb_deg": 12.3
}
```

**Why separate buckets?**
- **Deterministic selection**: Downstream layers don't need to re-classify
- **Clear boundaries**: Each bucket has explicit meaning
- **No hidden logic**: All classification happens in Layer 1, not downstream
- **Enforceable**: QA can validate bucket assignments match policy

## Salience Classification Rules

Salience is **not** about importance or meaning—it is a mathematical classification based on orb thresholds.

### Primary vs Secondary (Aspects Only)

For aspect transits:

- **Primary**: `orb_deg <= primary_max_deg` for that aspect type
- **Secondary**: `primary_max_deg < orb_deg <= secondary_max_deg` for that aspect type
- **Excluded or Background**: `orb_deg > secondary_max_deg` (excluded by default, or background if `include_background_aspects` is `true`)

### Background Conditions

Non-aspect conditions always go in `background_conditions`:
- Retrogrades
- Sign ingresses
- Lunations

These are conditions, not transits, so they don't have orb-based salience.

### Exclusion

Items are excluded when:
- `orb_deg > secondary_max_deg` and `include_background_aspects` is `false`
- Body is not in `body_inclusion_required` or `body_inclusion_optional` lists
- Aspect type is not in `supported_aspect_types`
- Fact kind is disabled in `fact_kinds` (e.g., `retrograde_facts: false`)

All exclusions are recorded in the `excluded` array with a reason.

## Excluded/Ignored Records

The `excluded` array is a **trace record**, not an error log. Every item that was evaluated but did not meet inclusion criteria is recorded here.

### Purpose

1. **Transparency**: Downstream layers can see what was considered but filtered
2. **Debugging**: Validate that policy is being applied correctly
3. **Auditability**: Full record of extraction decisions

### Record Structure

```typescript
{
  category: "aspect" | "body" | "orb_too_large" | "unsupported_type" | "fact_kind_disabled",
  reason: "Aspect orb (12.3°) exceeds secondary max threshold (10.0°)",
  context: {
    body_a: "mars",
    body_b: "jupiter",
    aspect_type: "square",
    orb_deg: 12.3
  }
}
```

### Common Exclusion Reasons

- `"orb_too_large"`: Aspect orb exceeds `secondary_max_deg` and background aspects not included
- `"unsupported_aspect_type"`: Aspect type not in `supported_aspect_types`
- `"body_not_included"`: Body not in required/optional lists
- `"fact_kind_disabled"`: Fact kind disabled in policy (e.g., `ingress_facts: false`)
- `"duplicate_aspect"`: Same aspect pair already recorded (should not happen)

## Policy Configuration

### `fact_kinds`

Controls which types of facts are extracted:
- `aspect_facts`: Include aspect transits
- `retrograde_facts`: Include retrograde conditions
- `ingress_facts`: Include sign ingress conditions
- `lunation_facts`: Include lunation conditions

### `include_background_aspects`

If `true`, aspects with `orb_deg > secondary_max_deg` are included in `background_conditions[]`.
If `false`, such aspects are excluded (recorded in `excluded`).

**Default**: `false` (background aspects excluded by default)

### `orb_thresholds`

Per-aspect-type thresholds for primary vs secondary classification:
- Each aspect type can have different thresholds
- `primary_max_deg`: Maximum orb for primary bucket
- `secondary_max_deg`: Maximum orb for secondary bucket

## Source Reference

The `source` field provides a reference to the Layer 0 `sky_state`:

```json
{
  "sky_state_schema_version": "1.0.0",
  "engine": "swisseph",
  "engine_version": "unversioned",
  "ephemeris_fileset": "unversioned"
}
```

This allows downstream layers to:
- Access full body position data from the referenced `sky_state`
- Verify data provenance
- Track which ephemeris data was used

## Versioning

### `technician_policy_version`

String identifier for the policy (e.g., `"tech_v1"`). Changes when:
- Orb thresholds are adjusted
- Supported aspect types change
- Body inclusion rules change
- Fact kind switches change

### `schema_version`

Semantic version for the schema (e.g., `"1.0.0"`). Follows semver:
- **Major**: Breaking changes to structure (removed fields, type changes, bucket changes)
- **Minor**: Additive changes (new optional fields, new condition types)
- **Patch**: Clarifications, bug fixes that don't change structure

## Constraints

- **No interpretation**: Facts describe geometric relationships and conditions, not meanings
- **Deterministic**: Same `sky_state` + policy always produces same facts
- **Complete trace**: All exclusions must be recorded
- **Policy-bound**: Only facts meeting policy criteria are included
- **No defaults**: Absent data is omitted, not inferred
- **No position duplication**: Body positions exist in source `sky_state`, not here

## Example Daily Facts Output

```json
{
  "schema_version": "1.0.0",
  "technician_policy_version": "tech_v1",
  "date": "2024-01-15",
  "timestamp_generated": "2024-01-15T12:00:00.000Z",
  "source": {
    "sky_state_schema_version": "1.0.0",
    "engine": "swisseph",
    "engine_version": "unversioned",
    "ephemeris_fileset": "unversioned"
  },
  "transits_primary": [
    {
      "body_a": "mars",
      "body_b": "saturn",
      "aspect_type": "square",
      "orb_deg": 2.5,
      "is_exact": false
    }
  ],
  "transits_secondary": [
    {
      "body_a": "venus",
      "body_b": "jupiter",
      "aspect_type": "trine",
      "orb_deg": 9.2,
      "is_exact": false
    }
  ],
  "background_conditions": [
    {
      "kind": "retrograde",
      "body": "mercury"
    },
    {
      "kind": "ingress",
      "body": "sun",
      "from_sign": "sagittarius",
      "to_sign": "capricorn"
    },
    {
      "kind": "lunation",
      "phase": "new",
      "sign": "aquarius"
    }
  ],
  "excluded": [
    {
      "category": "orb_too_large",
      "reason": "Aspect orb (12.3°) exceeds secondary max threshold (10.0°)",
      "context": {
        "body_a": "mercury",
        "body_b": "saturn",
        "aspect_type": "sextile",
        "orb_deg": 12.3
      }
    }
  ]
}
```

## Relationship to Other Layers

- **Layer 0** (`sky_state`): Pure astronomical data, all body positions, no filtering
- **Layer 1** (`daily_facts`): Policy-filtered facts in three buckets ← **You are here**
- **Layer 2** (`interpretation`): Meaning assignment to facts
- **Layer 3** (`editorial`): Editorial governance and planning
- **Layer 4** (`generation`): Voice and prose generation

