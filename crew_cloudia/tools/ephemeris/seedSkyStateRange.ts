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

/**
 * Seed sky_state_daily for a date range (idempotent/UPSERT safe)
 * Exported for use by runner preflight gate
 */
export async function seedSkyStateRange(startDate: string, endDate: string): Promise<void> {
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    throw new Error("Dates must be in YYYY-MM-DD format");
  }

  // Validate date order
  if (startDate > endDate) {
    throw new Error("Start date must be <= end date");
  }

  // Use compute_on_miss mode to compute and persist missing dates
  // This is idempotent - existing dates are not recomputed
  await getSkyStateRange(startDate, endDate, "compute_on_miss");
}

function parseArgs(argv: string[]): { startDate: string; endDate: string } {
  const [, , startDate, endDate] = argv;
  
  if (!startDate || !endDate) {
    console.error("Usage: tsx seedSkyStateRange.ts <start_date> <end_date>");
    console.error("Example: tsx seedSkyStateRange.ts 2026-01-01 2026-01-31");
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

  // Call the exported function
  await seedSkyStateRange(startDate, endDate);

  const allStates = await loadSkyStateDailyRange(startDate, endDate);
  const computedCount = Object.keys(allStates).filter((k) => allStates[k] !== null).length - existingCount;
  const persistedCount = computedCount; // All computed are persisted

  console.log(`  Computed: ${computedCount}`);
  console.log(`  Persisted: ${persistedCount}`);
  console.log(`  Total in range: ${Object.keys(allStates).length}`);

  console.log("✓ Seeding complete");
}

// Run CLI if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Error seeding sky_state range:", err);
    process.exit(1);
  });
}

