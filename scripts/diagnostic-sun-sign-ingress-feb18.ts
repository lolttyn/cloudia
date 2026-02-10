/**
 * Fix 7 diagnostic: Sun sign on ingress day (Feb 18, 2026).
 * Sun entered Pisces at 10:52 AM EST = 15:52 UTC. At noon UTC Feb 18 the Sun was still in Aquarius.
 *
 * Run: npx tsx scripts/diagnostic-sun-sign-ingress-feb18.ts
 */

import { julianDayFor, calcBody } from "../astro/ephemeris/swisseph.js";

const SIGNS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
];

function longitudeToSign(longitude: number): string {
  const normalized = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalized / 30);
  return SIGNS[signIndex];
}

function main() {
  const date = "2026-02-18";
  console.log("=== Sun sign on ingress day (Feb 18, 2026) ===\n");
  console.log("Sun entered Pisces at 10:52 AM EST = 15:52 UTC.");
  console.log("So at noon UTC the Sun is still in Aquarius; by 23:59 UTC it is in Pisces.\n");

  const jdNoon = julianDayFor(date, 12.0);
  const jdEndOfDay = julianDayFor(date, 23 + 59 / 60 + 59 / 3600);
  const jd1552 = julianDayFor(date, 15 + 52 / 60);

  const sunNoon = calcBody(jdNoon, "sun");
  const sunEndOfDay = calcBody(jdEndOfDay, "sun");
  const sun1552 = calcBody(jd1552, "sun");

  console.log("julianDayFor(date, 12.0)     → JD", jdNoon.toFixed(4), "→ Sun sign:", longitudeToSign(sunNoon.longitude));
  console.log("julianDayFor(date, 15.87)    → JD", jd1552.toFixed(4), "→ Sun sign:", longitudeToSign(sun1552.longitude), "(15:52 UTC)");
  console.log("julianDayFor(date, 23.9997)  → JD", jdEndOfDay.toFixed(4), "→ Sun sign:", longitudeToSign(sunEndOfDay.longitude), "(23:59 UTC)");
  console.log("");
  console.log("For a US audience, using end-of-day UTC (23:59) captures ingresses that occur during the US day.");
}

main();
