#!/usr/bin/env node

/**
 * CLI tool to run astrologyTechnician for a specific date
 * 
 * Usage:
 *   npx tsx crew_cloudia/tools/technician/runDailyFacts.ts 2025-12-19
 */

import { astrologyTechnician } from "../../astro/technician/astrologyTechnician.js";
import { upsertDailyFacts } from "../../astro/technician/persistence/upsertDailyFacts.js";

async function main() {
  const dateArg = process.argv[2];
  
  if (!dateArg) {
    console.error("Error: Date argument required");
    console.error("Usage: npx tsx crew_cloudia/tools/technician/runDailyFacts.ts YYYY-MM-DD");
    process.exit(1);
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateArg)) {
    console.error(`Error: Invalid date format: ${dateArg}`);
    console.error("Expected format: YYYY-MM-DD");
    process.exit(1);
  }
  
  try {
    console.log(`Computing daily facts for ${dateArg}...`);
    
    // Compute facts
    const facts = await astrologyTechnician({
      date: dateArg,
      timezone: "UTC",
    });
    
    // Upsert to Supabase (may fail if not configured)
    try {
      console.log("Persisting to Supabase...");
      await upsertDailyFacts(facts);
      console.log("✓ Persisted to Supabase");
    } catch (error) {
      console.warn("⚠ Could not persist to Supabase:", error instanceof Error ? error.message : String(error));
    }
    
    // Print summary
    const summary = {
      date: facts.date,
      policy_version: facts.technician_policy_version,
      schema_version: facts.schema_version,
      counts: {
        transits_primary: facts.transits_primary.length,
        transits_secondary: facts.transits_secondary.length,
        background_conditions: facts.background_conditions.length,
        excluded: facts.excluded.length,
      },
    };
    
    console.log("\n✓ Daily facts computed and persisted:");
    console.log(JSON.stringify(summary, null, 2));
    
  } catch (error) {
    console.error("\n✗ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

