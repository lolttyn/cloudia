# Phase 5.2 Parity Checklist

**Fixed Test Date:** `2024-01-15` (keep forever for comparison)

**Purpose:** Track differences between legacy and canonical interpreter paths to achieve meaning parity.

---

## How to Use This Checklist

1. Run the informational snapshot test:
   ```bash
   npx vitest run crew_cloudia/astro/interpretation/__tests__/legacyVsCanonicalParity.test.ts
   ```

2. Inspect the snapshot diffs in `__snapshots__/legacyVsCanonicalParity.test.ts.snap`

3. For each difference found, mark the corresponding item below and implement the fix

4. Re-run test and verify diff shrinks

5. When diff is minimal/empty, enable strict parity test and verify it passes

---

## Field-by-Field Parity Mapping

### Core Meaning Fields

#### `dominant_contrast_axis`
- **Legacy Source:** `pickAxis(moonEntry, canon)` - simply returns `moonEntry.dominant_axis` after validation
- **Legacy Logic:** 
  ```ts
  const axis = moonEntry.dominant_axis;
  ensureAxisAllowed(axis, canon);
  return axis;
  ```
- **Current Implementation:** `deriveDominantAxis()` - placeholder using first primary transit
- **Fix Required:** 
  1. Load moon sign from `SkyState.bodies.moon.sign`
  2. Load moon entry from interpretive canon (`canon.moon_signs[moonSign]`)
  3. Return `moonEntry.dominant_axis` directly
  4. Validate with `ensureAxisAllowed()` if that function exists
- **Status:** ❌ Placeholder - needs porting
- **Function to Fix:** `deriveDominantAxis()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need access to interpretive canon JSON

#### `why_today` (array)
- **Legacy Source:** `pickWhyToday(features, moonEntry, phaseEntry, aspect, canon.why_today_templates)` 
- **Legacy Logic:**
  1. Check for ingress (Moon/Sun) in `features.highlights` with `INGRESS_SENSITIVE_BODIES`
  2. If ingress found:
     - If `window === "next_24h"` and `to_sign !== currentSign`: "enters X within next 24h"
     - Else: "after entering from X within past 24h"
     - Append `templates.ingress`
  3. Else if aspect found:
     - "Today the Sun and Moon perfect a {aspect}, so {primary} outweighs {counter}"
     - Append `templates.aspect`
  4. Else:
     - `phaseEntry.why_today`
     - Append `templates.phase`
  5. Return `reasons.slice(0, 4)`
- **Current Implementation:** `deriveWhyToday()` - simple transit listing
- **Fix Required:** 
  1. Detect ingress from `DailyFacts.background_conditions` (kind === "ingress")
  2. Detect Sun-Moon aspect from `SkyState.aspects` (filter body_a/body_b for sun/moon)
  3. Load moon/phase entries from canon
  4. Port exact logic above
- **Status:** ❌ Placeholder - missing ingress/aspect/phase logic
- **Function to Fix:** `deriveWhyToday()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need ingress detection, aspect detection, canon entries, templates

#### `why_today_clause` (string)
- **Legacy Source:** First element of `why_today` array
- **Current Implementation:** First element or fallback
- **Fix Required:** Ensure it matches legacy (first element of `why_today`)
- **Status:** ⚠️ Likely OK but verify
- **Function to Fix:** `deriveDailyInterpretation()` - ensure `why_today_clause = why_today[0]`

#### `tone_descriptor`
- **Legacy Source:** `pickTone(moonEntry, phaseEntry, aspect, canon)`
- **Legacy Logic:**
  1. Start with `[moonEntry.tone]`
  2. If aspect exists: add `canon.aspects.sun_moon[aspect.aspect]?.tone` if present
  3. If `phaseEntry.why_today.includes("peaks")` and tone doesn't include "illuminated": add "illuminated"
  4. Return `parts.filter(Boolean).join("; ")`
- **Current Implementation:** Hardcoded `"balanced"`
- **Fix Required:** Port exact logic above
- **Status:** ❌ Placeholder
- **Function to Fix:** Add `deriveToneDescriptor()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need moon/phase entries, aspect detection, canon.aspects

#### `supporting_themes` (array)
- **Legacy Source:** `dedupe([...moonEntry.supporting_themes, ...(sunEntry.modulates ?? [])]).slice(0, 8)`
- **Current Implementation:** Empty array `[]`
- **Fix Required:** Load sun/moon canon entries and extract themes
- **Status:** ❌ Missing
- **Function to Fix:** Add `deriveSupportingThemes()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need access to interpretive canon (sun_signs, moon_signs)

---

### Sky Anchors

#### `sky_anchors` (array)
- **Legacy Source:** `buildAnchors(features.sun.sign, features.moon.sign, sunEntry, moonEntry)`
- **Legacy Logic:**
  ```ts
  return [
    {
      type: "moon_sign",
      label: `Moon in ${moonSign}`,
      meaning: moonEntry.core_meanings.join(", "),
    },
    {
      type: "sun_sign",
      label: `Sun in ${sunSign}`,
      meaning: sunEntry.core_meanings.join(", "),
    },
  ];
  ```
- **Current Implementation:** Simple `{body, sign, description}` from `SkyState`
- **Fix Required:** 
  1. Load sun/moon entries from canon
  2. Transform to `{type, label, meaning}` format
  3. Order: moon_sign first, then sun_sign
- **Status:** ❌ Structure mismatch - needs transformation
- **Function to Fix:** `transformSkyAnchors()` in `transformToInterpretiveFrame.ts`
- **Dependencies:** Need sun/moon canon entries

---

### Causal Logic

#### `causal_logic` (array)
- **Legacy Source:** `buildCausalLogic(sunSign, moonSign, sunEntry, moonEntry, aspect, canon)`
- **Legacy Logic:**
  1. Always include:
     - `"Because the Moon is in {moonSign}, {core_meanings[0]} and {core_meanings[1]} take precedence."`
     - `"Because the Sun is in {sunSign}, the day stays framed by {core_meanings.join(' and ')}."`
  2. If aspect exists:
     - `"Because the Sun and Moon form a {aspect}, {canon.aspects.sun_moon[aspect].meaning}."`
- **Current Implementation:** Simple transit descriptions
- **Fix Required:** Port exact logic above
- **Status:** ❌ Placeholder
- **Function to Fix:** `deriveCausalLogic()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need sun/moon canon entries, aspect detection, canon.aspects

---

### Signals

#### `signals` (array)
- **Legacy Source:** `deriveSignalsFromSkyFeatures(features)` 
- **Legacy Logic:**
  1. Sun in sign: `{signal_key: sunInSignKey(sign), kind: "planet_in_sign", salience: 0.35, source: "sky_features", meta: {...}}`
  2. Moon in sign: `{signal_key: moonInSignKey(sign), kind: "planet_in_sign", salience: 0.3, source: "sky_features", meta: {...}}`
  3. Moon phase: `{signal_key: moonPhaseKey(phase), kind: "lunar_phase", salience: moonPhaseSalience(phase), source: "sky_features", meta: {...}}`
  4. Lunation (if new/full): `{signal_key: newMoonKey/fullMoonKey(sign), kind: "lunation", salience: 0.95, source: "sky_features", meta: {...}}`
  5. Aspects from highlights: `{signal_key: sunMoonAspectKey(aspect), kind: "aspect", salience: aspectSalience(orb_deg), source: "sky_features", orb_deg, meta: {...}}`
  6. Ingresses from highlights: `{signal_key: ingressKey(to_sign, window), kind: "ingress", salience: 0.2, source: "sky_features", meta: {...}}`
  7. Sort by salience (desc), then signal_key (asc)
- **Current Implementation:** Simple mapping from `interpreter_transits_v1` - wrong structure
- **Fix Required:** Port entire `deriveSignalsFromSkyFeatures()` logic
- **Status:** ❌ Completely different structure
- **Function to Fix:** `deriveDailyInterpretation()` - signals derivation
- **Dependencies:** Need signal key functions, salience calculations, ingress detection

#### Signal Ordering
- **Issue:** Arrays from maps/sets may have non-deterministic order
- **Fix Required:** Sort signals by stable keys (salience, then signal_key)
- **Status:** ⚠️ Verify ordering
- **Function to Fix:** `deriveDailyInterpretation()` - add deterministic sort

---

### Interpretation Bundles

#### `interpretation_bundles`
- **Legacy Source:** `selectInterpretationBundles({ signals, bundleIndex })`
- **Legacy Logic:**
  1. For each signal, get bundles from `bundleIndex.get(signal.signal_key)`
  2. Choose bundle: sort by version (desc), check `orb_max_degrees` constraint if present
  3. Categorize: `lunar_phase` → phaseBundles, `planet_in_sign` → placementBundles, else → acceptedBundles
  4. Combine: `[...phaseBundles, ...placementBundles, ...acceptedBundles]`
  5. First 2 → primary, 3rd → secondary, rest → suppressed with reason "over_cap"
  6. Suppress bundles that fail orb constraints with reason "constraint_mismatch"
- **Current Implementation:** `transformInterpretationBundles()` - simplified lookup (wrong)
- **Fix Required:** Port entire `selectInterpretationBundles()` logic
- **Status:** ❌ Completely wrong - needs full port
- **Function to Fix:** `transformInterpretationBundles()` in `transformToInterpretiveFrame.ts`
- **Dependencies:** Need signal structure to match legacy (see signals fix above)

#### Bundle Ordering
- **Issue:** Bundle arrays may have non-deterministic order
- **Fix Required:** Sort by stable keys (bundle_id or signal_key)
- **Status:** ⚠️ Verify ordering
- **Function to Fix:** `transformInterpretationBundles()` - add deterministic sort

---

### Confidence

#### `confidence_level`
- **Legacy Source:** `confidenceFrom(aspect)` 
- **Legacy Logic:**
  ```ts
  if (aspect?.type === "aspect") {
    if (aspect.orb_deg <= 2) return "high";
    if (aspect.orb_deg <= 4) return "medium";
    return "low";
  }
  return "medium";
  ```
- **Current Implementation:** `deriveConfidenceLevel()` - counts primary/secondary transits (wrong)
- **Fix Required:** 
  1. Detect Sun-Moon aspect from `SkyState.aspects`
  2. Apply orb-based logic above
  3. Default to "medium" if no aspect
- **Status:** ❌ Completely different logic
- **Function to Fix:** `deriveConfidenceLevel()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need Sun-Moon aspect detection

---

### Window Logic Fields (Phase 5.3 - Currently Placeholders)

#### `temporal_phase`
- **Legacy Source:** `deriveTemporalPhase(features, windowFeatures)`
- **Current Implementation:** Hardcoded `"baseline"`
- **Status:** ⏸️ Phase 5.3 - window logic
- **Note:** Keep as placeholder until Phase 5.3

#### `intensity_modifier`
- **Legacy Source:** `deriveIntensityModifier(axisStatement, temporal_phase, windowFeatures, input.date)`
- **Current Implementation:** Hardcoded `"emerging"`
- **Status:** ⏸️ Phase 5.3 - window logic
- **Note:** Keep as placeholder until Phase 5.3

#### `continuity`
- **Legacy Source:** `buildContinuityHooks(temporal_phase, intensity_modifier, windowFeatures, axisStatement, baseDate)`
- **Current Implementation:** Empty object `{}`
- **Status:** ⏸️ Phase 5.3 - window logic
- **Note:** Keep as placeholder until Phase 5.3

#### `temporal_arc`
- **Legacy Source:** `deriveTemporalArc(temporal_phase, intensity_modifier, features, windowFeatures)`
- **Current Implementation:** Hardcoded baseline values
- **Status:** ⏸️ Phase 5.3 - window logic
- **Note:** Keep as placeholder until Phase 5.3

#### `timing`
- **Legacy Source:** `{ state: phaseEntry.timing_state, notes: timingNotes }`
- **Current Implementation:** Hardcoded `{ state: "building", notes: "Phase 5.2: window logic pending" }`
- **Fix Required:** Extract `timing_state` from lunar phase canon entry
- **Status:** ⚠️ Partial - can fix now (no window needed)
- **Function to Fix:** `transformToInterpretiveFrame()` - load phase entry for timing_state

---

### Optional Fields

#### `lunation`
- **Legacy Source:** `resolveLunation(signals)`
- **Current Implementation:** `undefined`
- **Fix Required:** Port `resolveLunation()` logic
- **Status:** ❌ Missing
- **Function to Fix:** Add to `deriveDailyInterpretation()` or `transformToInterpretiveFrame()`

---

### Metadata Fields

#### `canon_compliance`
- **Legacy Source:** `{ violations: [], notes: [`canon:v${canon.version}`] }`
- **Current Implementation:** `{ violations: [], notes: ["Phase 5.2: derived from canonical inputs"] }`
- **Fix Required:** Extract canon version from inputs
- **Status:** ⚠️ Minor - update note format
- **Function to Fix:** `transformToInterpretiveFrame()` - use actual canon version

---

## Ordering Requirements (Non-Negotiable)

All arrays must be deterministically sorted:

1. **`signals`**: Sort by `salience` (primary < secondary < background), then `signal_key` (alphabetical)
2. **`interpretation_bundles.primary`**: Sort by `bundle_id` (alphabetical)
3. **`interpretation_bundles.secondary`**: Sort by `bundle_id` (alphabetical)
4. **`interpretation_bundles.suppressed`**: Sort by `bundle_slug` (alphabetical)
5. **`why_today`**: Keep legacy order (first = ingress/aspect, second = template)
6. **`causal_logic`**: Keep legacy order (first = aspect-based if exists)
7. **`supporting_themes`**: Sort alphabetically after dedupe
8. **`sky_anchors`**: Sort by `type` (sun_sign < moon_sign < major_aspect), then `label` (alphabetical)

---

## Dependencies Needed

To port legacy logic, we need access to:

1. **Interpretive Canon** (`interpretiveCanon_v1.json`):
   - `sun_signs[sign]` - for sun entry
   - `moon_signs[sign]` - for moon entry  
   - `moon_phases[phase]` - for phase entry
   - `why_today_templates` - for why_today templates

2. **Aspect Detection**:
   - From `DailyFacts.transits_primary` or `SkyState.aspects`
   - Need to detect Sun-Moon aspects specifically

3. **Ingress Detection**:
   - From `DailyFacts.background_conditions` (ingress kind)
   - Or from `SkyState` comparison (yesterday vs today)

---

## Implementation Priority

### High Priority (Core Meaning)
1. ✅ `dominant_contrast_axis` - Core meaning
2. ✅ `why_today` / `why_today_clause` - Core meaning
3. ✅ `tone_descriptor` - Core meaning
4. ✅ `supporting_themes` - Core meaning
5. ✅ `causal_logic` - Core meaning

### Medium Priority (Structure)
6. ✅ `sky_anchors` - Structure transformation
7. ✅ `signals` - Structure and derivation
8. ✅ `interpretation_bundles` - Full port of selection logic
9. ✅ `confidence_level` - Logic port

### Low Priority (Metadata)
10. ✅ `timing.state` - Can fix now (no window needed)
11. ✅ `lunation` - Optional field
12. ✅ `canon_compliance.notes` - Format update

### Phase 5.3 (Window Logic)
- `temporal_phase`
- `intensity_modifier`
- `continuity`
- `temporal_arc`

---

## Testing Strategy

1. **Run informational test** → capture snapshot
2. **Fix one field** → re-run test → verify diff shrinks
3. **Repeat** until diff is minimal
4. **Enable strict test** → verify it passes
5. **Switch production** to canonical path

---

## Notes

- **Don't improve meaning** - port exactly, improve later
- **Ordering is critical** - most parity failures are just ordering
- **Use stable sorts** - always sort by deterministic keys
- **Test incrementally** - fix one field at a time, verify diff shrinks

