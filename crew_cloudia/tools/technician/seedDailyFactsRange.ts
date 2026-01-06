#!/usr/bin/env node
/**
 * CLI tool to seed astrology_daily_facts table for a date range
 * 
 * Usage:
 *   npx tsx crew_cloudia/tools/technician/seedDailyFactsRange.ts 2026-01-01 2026-01-31
 */

import "dotenv/config";
import { getDailyFactsRange } from "../../astro/technician/persistence/getDailyFactsRange.js";
import { loadDailyFactsRange } from "../../astro/technician/persistence/loadDailyFactsRange.js";

function parseArgs(argv: string[]): { startDate: string; endDate: string } {
  const [, , startDate, endDate] = argv;
  
  if (!startDate || !endDate) {
    console.error("Usage: tsx seedDailyFactsRange.ts <start_date> <end_date>");
    console.error("Example: tsx seedDailyFactsRange.ts 2026-01-01 2026-01-31");
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

  console.log(`Seeding astrology_daily_facts from ${startDate} to ${endDate}...`);

  // First, check what's already loaded
  const existing = await loadDailyFactsRange(startDate, endDate);
  const existingCount = Object.values(existing).filter((f) => f !== null).length;
  const totalDates = Object.keys(existing).length;
  const missingCount = totalDates - existingCount;

  console.log(`  Existing records: ${existingCount}/${totalDates}`);

  if (missingCount === 0) {
    console.log("  ✓ All dates already seeded");
    return;
  }

  // Use compute_on_miss mode to compute and persist missing dates
  const allFacts = await getDailyFactsRange(startDate, endDate, "compute_on_miss");

  const computedCount = Object.keys(allFacts).length - existingCount;
  const persistedCount = computedCount; // All computed are persisted

  console.log(`  Computed: ${computedCount}`);
  console.log(`  Persisted: ${persistedCount}`);
  console.log(`  Total in range: ${Object.keys(allFacts).length}`);

  console.log("✓ Seeding complete");
}

main().catch((err) => {
  console.error("Error seeding daily_facts range:", err);
  process.exit(1);
});

