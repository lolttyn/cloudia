#!/usr/bin/env node
/**
 * CLI tool to seed sky_state_daily table for a date range
 * 
 * Usage:
 *   npx tsx crew_cloudia/tools/ephemeris/seedSkyStateRange.ts 2026-01-01 2026-01-31
 */

import "dotenv/config";
import { getSkyStateRange } from "../../astro/ephemeris/persistence/getSkyStateRange.js";
import { loadSkyStateDailyRange } from "../../astro/ephemeris/persistence/loadSkyStateDailyRange.js";

function parseArgs(argv: string[]): { startDate: string; endDate: string } {
  const [, , startDate, endDate] = argv;
  
  if (!startDate || !endDate) {
    console.error("Usage: tsx seedSkyStateRange.ts <start_date> <end_date>");
    console.error("Example: tsx seedSkyStateRange.ts 2026-01-01 2026-01-31");
    process.exit(1);
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    console.error("Dates must be in YYYY-MM-DD format");
    process.exit(1);
  }

  // Validate date order
  if (startDate > endDate) {
    console.error("Start date must be <= end date");
    process.exit(1);
  }

  return { startDate, endDate };
}

async function main() {
  const { startDate, endDate } = parseArgs(process.argv);

  console.log(`Seeding sky_state_daily from ${startDate} to ${endDate}...`);

  // First, check what's already loaded
  const existing = await loadSkyStateDailyRange(startDate, endDate);
  const existingCount = Object.values(existing).filter((s) => s !== null).length;
  const totalDates = Object.keys(existing).length;
  const missingCount = totalDates - existingCount;

  console.log(`  Existing records: ${existingCount}/${totalDates}`);

  if (missingCount === 0) {
    console.log("  ✓ All dates already seeded");
    return;
  }

  // Use compute_on_miss mode to compute and persist missing dates
  const allStates = await getSkyStateRange(startDate, endDate, "compute_on_miss");

  const computedCount = Object.keys(allStates).length - existingCount;
  const persistedCount = computedCount; // All computed are persisted

  console.log(`  Computed: ${computedCount}`);
  console.log(`  Persisted: ${persistedCount}`);
  console.log(`  Total in range: ${Object.keys(allStates).length}`);

  console.log("✓ Seeding complete");
}

main().catch((err) => {
  console.error("Error seeding sky_state range:", err);
  process.exit(1);
});

