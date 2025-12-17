// Dev-only diagnostic to validate Swiss Ephemeris data availability.
import { julianDayFor, calcBody } from "./swisseph.js";

const jd = julianDayFor("2025-12-17", 12.0);
const sun = calcBody(jd, "sun");

console.log("[swisseph] OK");
console.log(`JD: ${jd}`);
console.log(
  `Sun: ${sun.longitude.toFixed(2)}°  speed: ${sun.speed_deg_per_day.toFixed(
    2
  )}°/day`
);


