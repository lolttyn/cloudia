// DEV TOOL: do not use in production paths; for ephemeris verification only.
import { computeSkyState } from "../../../astro/computeSkyState.js";

function usage() {
  console.error(
    "Usage: tsx crew_cloudia/tools/ephemeris/printDailySky.ts [YYYY-MM-DD]"
  );
}

async function main() {
  const date = process.argv[2] || "2025-12-19";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    usage();
    process.exit(1);
  }

  const sky = await computeSkyState({ date, timezone: "UTC" });

  const payload = {
    timestamp: sky.timestamp,
    bodies: {
      sun: sky.bodies.sun,
      moon: sky.bodies.moon,
    },
    lunar: sky.lunar ?? {},
  };

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

