#!/usr/bin/env node
/**
 * Force-recompute and upsert sky_state for a single date (e.g. after end-of-day UTC fix).
 * Usage: npx tsx crew_cloudia/tools/ephemeris/recomputeSkyStateDate.ts 2026-02-18
 */

import "dotenv/config";
import { computeSkyState } from "../../../astro/computeSkyState.js";
import { upsertSkyStateDaily } from "../../astro/ephemeris/persistence/upsertSkyStateDaily.js";

const date = process.argv[2];
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("Usage: tsx recomputeSkyStateDate.ts YYYY-MM-DD");
  process.exit(1);
}

async function main() {
  const state = await computeSkyState({ date, timezone: "UTC" });
  await upsertSkyStateDaily(state);
  const sunSign = state.bodies?.sun?.sign ?? "?";
  console.log(`Recomputed and upserted sky_state_daily for ${date}. Sun sign: ${sunSign}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
