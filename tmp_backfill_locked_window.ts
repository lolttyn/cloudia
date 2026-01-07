import { computeSkyState } from "./astro/computeSkyState.js";
import { upsertSkyStateDaily } from "./crew_cloudia/astro/ephemeris/persistence/upsertSkyStateDaily.js";

import { deriveDailyFactsFromSkyState } from "./crew_cloudia/astro/technician/astrologyTechnician.js";
import { TECHNICIAN_POLICY_V1 } from "./crew_cloudia/astro/technician/policy/technicianPolicy.v1.js";
import { upsertDailyFacts } from "./crew_cloudia/astro/technician/persistence/upsertDailyFacts.js";

const DATES = ["2026-01-07","2026-01-08","2026-01-09","2026-01-10","2026-01-11","2026-01-12","2026-01-13"];

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
