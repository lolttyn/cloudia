import { createClient } from "@supabase/supabase-js";
import { upsertSkyStateDaily } from "./crew_cloudia/astro/ephemeris/persistence/upsertSkyStateDaily";
import { upsertDailyFacts } from "./crew_cloudia/astro/technician/persistence/upsertDailyFacts";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");

const supabase = createClient(url, key);

const DATES = ["2026-01-07","2026-01-08","2026-01-09","2026-01-10","2026-01-11","2026-01-12","2026-01-13"];

(async () => {
  for (const episode_date of DATES) {
    console.log(`\n[backfill] ${episode_date} (sky_state_daily)`);
    await upsertSkyStateDaily({ supabase, episode_date } as any);

    console.log(`[backfill] ${episode_date} (astrology_daily_facts)`);
    await upsertDailyFacts({ supabase, episode_date } as any);
  }
  console.log("\n[backfill] done");
})();
