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
- **Legacy Source:** `pickAxis(moonEntry, canon)` in `crew_cloudia/interpretation/runInterpreter.ts`
- **Current Implementation:** `deriveDominantAxis()` in `deriveDailyInterpretation.ts` (placeholder)
- **Fix Required:** Port `pickAxis()` logic to use `DailyFacts` + `SkyState` instead of `SkyFeatures` + canon entries
- **Status:** ❌ Placeholder - needs porting
- **Function to Fix:** `deriveDominantAxis()` in `deriveDailyInterpretation.ts`

#### `why_today` (array)
- **Legacy Source:** `pickWhyToday(features, moonEntry, phaseEntry, aspect, canon.why_today_templates)` 
- **Current Implementation:** `deriveWhyToday()` - simple transit listing
- **Fix Required:** Port logic that:
  - Checks for ingress (Moon/Sun) with window detection
  - Checks for Sun-Moon aspects
  - Falls back to lunar phase templates
  - Uses canon templates (`why_today_templates`)
- **Status:** ❌ Placeholder - missing ingress/aspect/phase logic
- **Function to Fix:** `deriveWhyToday()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need to detect ingress from `DailyFacts.background_conditions` or `SkyState`

#### `why_today_clause` (string)
- **Legacy Source:** First element of `why_today` array
- **Current Implementation:** First element or fallback
- **Fix Required:** Ensure it matches legacy (first element of `why_today`)
- **Status:** ⚠️ Likely OK but verify
- **Function to Fix:** `deriveDailyInterpretation()` - ensure `why_today_clause = why_today[0]`

#### `tone_descriptor`
- **Legacy Source:** `pickTone(moonEntry, phaseEntry, aspect, canon)`
- **Current Implementation:** Hardcoded `"balanced"`
- **Fix Required:** Port `pickTone()` logic
- **Status:** ❌ Placeholder
- **Function to Fix:** Add `deriveToneDescriptor()` in `deriveDailyInterpretation.ts`

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
- **Current Implementation:** Simple `{body, sign, description}` from `SkyState`
- **Fix Required:** Port `buildAnchors()` which creates `{type, label, meaning}` format
- **Status:** ❌ Structure mismatch - needs transformation
- **Function to Fix:** `transformSkyAnchors()` in `transformToInterpretiveFrame.ts`
- **Note:** Legacy format is `{type: "sun_sign"|"moon_sign"|"major_aspect", label: string, meaning: string}`

---

### Causal Logic

#### `causal_logic` (array)
- **Legacy Source:** `buildCausalLogic(sunSign, moonSign, sunEntry, moonEntry, aspect, canon)`
- **Current Implementation:** Simple transit descriptions
- **Fix Required:** Port `buildCausalLogic()` which uses canon entries and aspect info
- **Status:** ❌ Placeholder
- **Function to Fix:** `deriveCausalLogic()` in `deriveDailyInterpretation.ts`
- **Dependencies:** Need canon entries and aspect detection

---

### Signals

#### `signals` (array)
- **Legacy Source:** `deriveSignalsFromSkyFeatures(features)` 
- **Current Implementation:** Simple mapping from `interpreter_transits_v1`
- **Fix Required:** Port `deriveSignalsFromSkyFeatures()` logic
- **Status:** ❌ Structure likely different
- **Function to Fix:** `deriveDailyInterpretation()` - signals derivation
- **Note:** Legacy signals have `source: "sky_features"` and specific structure

#### Signal Ordering
- **Issue:** Arrays from maps/sets may have non-deterministic order
- **Fix Required:** Sort signals by stable keys (salience, then signal_key)
- **Status:** ⚠️ Verify ordering
- **Function to Fix:** `deriveDailyInterpretation()` - add deterministic sort

---

### Interpretation Bundles

#### `interpretation_bundles`
- **Legacy Source:** `selectInterpretationBundles({ signals, bundleIndex })`
- **Current Implementation:** `transformInterpretationBundles()` - simplified lookup
- **Fix Required:** Port `selectInterpretationBundles()` logic exactly
- **Status:** ❌ Simplified - needs full port
- **Function to Fix:** `transformInterpretationBundles()` in `transformToInterpretiveFrame.ts`
- **Note:** Legacy returns `{primary, secondary, suppressed}` with full bundles

#### Bundle Ordering
- **Issue:** Bundle arrays may have non-deterministic order
- **Fix Required:** Sort by stable keys (bundle_id or signal_key)
- **Status:** ⚠️ Verify ordering
- **Function to Fix:** `transformInterpretationBundles()` - add deterministic sort

---

### Confidence

#### `confidence_level`
- **Legacy Source:** `confidenceFrom(aspect)` - checks if aspect exists
- **Current Implementation:** `deriveConfidenceLevel()` - counts primary/secondary transits
- **Fix Required:** Port `confidenceFrom()` logic (aspect-based, not transit-count-based)
- **Status:** ❌ Different logic
- **Function to Fix:** `deriveConfidenceLevel()` in `deriveDailyInterpretation.ts`
- **Note:** Legacy checks for aspect presence, not transit counts

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

