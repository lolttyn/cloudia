import { computeSkyState } from "./astro/computeSkyState.js";
import { upsertSkyStateDaily } from "./crew_cloudia/astro/ephemeris/persistence/upsertSkyStateDaily.js";

import { deriveDailyFactsFromSkyState } from "./crew_cloudia/astro/technician/astrologyTechnician.js";
import { TECHNICIAN_POLICY_V1 } from "./crew_cloudia/astro/technician/policy/technicianPolicy.v1.js";
import { upsertDailyFacts } from "./crew_cloudia/astro/technician/persistence/upsertDailyFacts.js";

const START_DATE = "2026-01-01";
const END_DATE = "2026-01-24"; // inclusive

function enumerateDatesInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);

  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
  }
  return out;
}

const DATES = enumerateDatesInclusive(START_DATE, END_DATE);

(async () => {
  for (const date of DATES) {
    console.log(`\n[backfill] ${date}`);

    const sky = await computeSkyState({ date, timezone: "UTC" });
    await upsertSkyStateDaily(sky);

    const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
    await upsertDailyFacts(facts);

    console.log(`[backfill] ok ${date}`);
  }
  console.log("\n[backfill] done");
})();
