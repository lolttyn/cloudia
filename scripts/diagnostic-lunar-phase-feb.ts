/**
 * Fix 6 diagnostic: Lunar phase direction for Feb 10–11.
 * Full Moon was Feb 2, New Moon Feb 17 — so Feb 10–11 should be waning (releasing), not building.
 *
 * Run: npx tsx scripts/diagnostic-lunar-phase-feb.ts
 */

import { computeSkyState } from "../astro/computeSkyState.js";
import { computeLunarPhase } from "../astro/computeLunar.js";

async function main() {
  const dates = ["2026-02-10", "2026-02-11"];
  console.log("=== Lunar phase diagnostic (Feb 10–11, 2026) ===\n");
  console.log("Expected: waning (Full Moon Feb 2, New Moon Feb 17) → temporal_phase = releasing\n");

  for (const date of dates) {
    const sky = await computeSkyState({ date, timezone: "UTC" });
    const lunar = sky.lunar;
    const sunLon = sky.bodies.sun.longitude;
    const moonLon = sky.bodies.moon.longitude;

    // How mapSkyStateToSkyFeatures maps phase_name → legacyPhase
    const phaseName = lunar?.phase_name;
    let legacyPhase: "new" | "waxing" | "full" | "waning" = "waxing";
    if (phaseName) {
      if (phaseName === "new") legacyPhase = "new";
      else if (phaseName.startsWith("waxing")) legacyPhase = "waxing";
      else if (phaseName === "full") legacyPhase = "full";
      else if (phaseName.startsWith("waning") || phaseName === "last_quarter") legacyPhase = "waning";
    }

    // How deriveTemporalPhase maps legacyPhase → temporal_phase
    const temporalPhase =
      legacyPhase === "full"
        ? "peak"
        : legacyPhase === "waning"
          ? "releasing"
          : legacyPhase === "waxing"
            ? "building"
            : legacyPhase === "new"
              ? "baseline"
              : "baseline";

    console.log(`Date: ${date} (noon UTC)`);
    console.log(`  lunar.phase_name:     ${lunar?.phase_name ?? "(missing)"}`);
    console.log(`  lunar.elongation_deg: ${(lunar as any)?.elongation_deg ?? "N/A"}`);
    console.log(`  Sun longitude:       ${sunLon.toFixed(2)}°`);
    console.log(`  Moon longitude:      ${moonLon.toFixed(2)}°`);
    console.log(`  → legacyPhase:       ${legacyPhase}`);
    console.log(`  → temporal_phase:    ${temporalPhase}`);
    console.log("");
  }

  console.log("=== computeLunar.ts phase boundaries (phaseNameFromAngle) ===");
  console.log("  elongation [0, 22.5) or [337.5, 360) → new");
  console.log("  [22.5, 67.5)   → waxing_crescent");
  console.log("  [67.5, 112.5)  → first_quarter");
  console.log("  [112.5, 157.5) → waxing_gibbous");
  console.log("  [157.5, 202.5) → full");
  console.log("  [202.5, 247.5) → waning_gibbous");
  console.log("  [247.5, 292.5) → last_quarter");
  console.log("  [292.5, 337.5) → waning_crescent");
  console.log("");
  console.log("  elongation = (moonLon - sunLon + 360) % 360 (directed, so after Full Moon elongation goes 180 → 360 → 0).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
