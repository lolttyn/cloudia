# Cloudia Crew — Operations Guide

## Canonical Run Preseed (Required)

**Ops Invariant:** Canonical interpretation mode requires pre-seeded Layer 0 and Layer 1 data in Supabase before running episode batches.

### Prerequisites

- Environment variables configured (`.env` file with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)
- Date format: `YYYY-MM-DD` (e.g., `2026-01-14`)

### Preseed Steps

To run a canonical episode batch for date `D`, you **must** seed both layers first:

#### Step 1: Seed Layer 0 (Sky State)

```bash
npx tsx --env-file=.env crew_cloudia/tools/ephemeris/seedSkyStateRange.ts D D
```

**What it does:**
- Computes astronomical state for date `D` using Swiss Ephemeris
- Persists to `public.sky_state_daily` table in Supabase
- Required columns: `episode_date`, `sky_state` (jsonb), metadata fields

#### Step 2: Seed Layer 1 (Daily Facts)

```bash
npx tsx --env-file=.env crew_cloudia/tools/technician/seedDailyFactsRange.ts D D
```

**What it does:**
- Derives astrological facts from Layer 0 sky state
- Persists to `public.astrology_daily_facts` table in Supabase
- Required columns: `episode_date`, `facts` (jsonb), metadata fields
- **Note:** Requires Layer 0 to exist first (Step 1 must complete successfully)

#### Step 3: Run Canonical Episode Batch

```bash
CLOUDIA_INTERPRETATION_MODE=canonical npx tsx --env-file=.env crew_cloudia/runner/runEpisodeBatch.ts cloudia D --window-days 1
```

**What it does:**
- Loads pre-seeded Layer 0 and Layer 1 data via `loadInterpretationInputs()`
- Runs canonical interpreter (`runInterpreterCanonical`)
- Generates episode segments (intro, main_themes, closing)
- Enforces publish-time gates (`assertEpisodeIsPublishable`)

### Error: MissingSkyStateError

If you see:
```
MissingSkyStateError: Missing sky_state_daily for 2026-01-14
```

**Cause:** Layer 0 data not seeded for that date.

**Fix:** Run Step 1 above for the missing date.

### Error: MissingDailyFactsError

If you see:
```
MissingDailyFactsError: Missing daily_facts for 2026-01-14
```

**Cause:** Layer 1 data not seeded for that date (or Layer 0 missing).

**Fix:** Ensure Layer 0 exists, then run Step 2 above.

### Verification

To verify both layers exist for a date:

```sql
SELECT 
  s.episode_date,
  CASE 
    WHEN s.episode_date IS NOT NULL THEN '✓ sky_state_daily'
    ELSE '✗ sky_state_daily MISSING'
  END as layer0_status,
  CASE 
    WHEN f.episode_date IS NOT NULL THEN '✓ astrology_daily_facts'
    ELSE '✗ astrology_daily_facts MISSING'
  END as layer1_status
FROM (SELECT '2026-01-14'::text as episode_date) d
LEFT JOIN public.sky_state_daily s ON s.episode_date = d.episode_date
LEFT JOIN public.astrology_daily_facts f ON f.episode_date = d.episode_date;
```

Replace `2026-01-14` with your target date.

### Quick Reference

**For a single date `D`:**
```bash
# Preseed
npx tsx --env-file=.env crew_cloudia/tools/ephemeris/seedSkyStateRange.ts D D
npx tsx --env-file=.env crew_cloudia/tools/technician/seedDailyFactsRange.ts D D

# Run
CLOUDIA_INTERPRETATION_MODE=canonical npx tsx --env-file=.env crew_cloudia/runner/runEpisodeBatch.ts cloudia D --window-days 1
```

**For a date range:**
```bash
# Preseed range
npx tsx --env-file=.env crew_cloudia/tools/ephemeris/seedSkyStateRange.ts START_DATE END_DATE
npx tsx --env-file=.env crew_cloudia/tools/technician/seedDailyFactsRange.ts START_DATE END_DATE

# Run batch
CLOUDIA_INTERPRETATION_MODE=canonical npx tsx --env-file=.env crew_cloudia/runner/runEpisodeBatch.ts cloudia START_DATE --window-days N
```

---

## System Architecture

### Layer Dependencies

```
Layer 0 (sky_state_daily)
  ↓
Layer 1 (astrology_daily_facts)
  ↓
Layer 2 (interpretation via runInterpreterCanonical)
  ↓
Layer 3 (editorial governance)
  ↓
Layer 4 (voice generation)
```

**Critical:** Each layer requires the previous layer to be seeded before use.

### Storage Tables

- **`public.sky_state_daily`**: Layer 0 astronomical state
  - Key: `episode_date` (text, primary key)
  - Payload: `sky_state` (jsonb)
  
- **`public.astrology_daily_facts`**: Layer 1 astrological facts
  - Key: `episode_date` (text, primary key)
  - Payload: `facts` (jsonb)
  - Dependency: Requires `sky_state_daily` for same date

### Code Paths

- **Loader:** `crew_cloudia/astro/interpretation/loadInterpretationInputs.ts`
- **Error source:** `crew_cloudia/astro/interpretation/errors.ts` (MissingSkyStateError, MissingDailyFactsError)
- **Seed scripts:**
  - Layer 0: `crew_cloudia/tools/ephemeris/seedSkyStateRange.ts`
  - Layer 1: `crew_cloudia/tools/technician/seedDailyFactsRange.ts`

