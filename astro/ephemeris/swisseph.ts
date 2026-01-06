import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const swe = require("swisseph");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EPHE_PATH = path.resolve(__dirname, "../../ephemeris/ephe");
const REQUIRED_PREFIXES = ["sepl_", "semo_", "seas_"];

function ensureEphePath() {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(EPHE_PATH);
  } catch {
    throw new Error(
      `Swiss Ephemeris data files not found at ${EPHE_PATH}. ` +
        "Place .se1 files in ephemeris/ephe/."
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `Swiss Ephemeris path ${EPHE_PATH} is not a directory. ` +
        "Place .se1 files in ephemeris/ephe/."
    );
  }

  const entries = fs.readdirSync(EPHE_PATH);
  const se1Files = entries.filter((name) =>
    name.toLowerCase().endsWith(".se1")
  );

  if (!se1Files.length) {
    throw new Error(
      `Swiss Ephemeris .se1 files are missing in ${EPHE_PATH}. ` +
        "Download the Swiss Ephemeris data set and place the .se1 files there."
    );
  }

  const missing = REQUIRED_PREFIXES.filter(
    (prefix) => !se1Files.some((name) => name.toLowerCase().startsWith(prefix))
  );

  if (missing.length) {
    throw new Error(
      `Swiss Ephemeris .se1 files incomplete in ${EPHE_PATH}. Missing prefixes: ${missing.join(
        ", "
      )}. Found: ${se1Files.join(", ") || "none"}.`
    );
  }
}

let initialized = false;
function init() {
  if (initialized) return;
  ensureEphePath();
  swe.swe_set_ephe_path(EPHE_PATH);
  initialized = true;
}

/**
 * Get the Swiss Ephemeris engine version string.
 * Returns version like "2.10.03" or similar.
 */
export function getEngineVersion(): string {
  init();
  const version = swe.swe_version();
  if (typeof version !== "string" || !version) {
    throw new Error("Failed to retrieve Swiss Ephemeris version");
  }
  return version;
}

/**
 * Get a deterministic identifier for the ephemeris fileset.
 * This identifier changes when ephemeris files are added, removed, or modified.
 * 
 * Strategy: Create a hash from the sorted list of .se1 filenames and their sizes.
 * This ensures determinism while detecting changes to the fileset.
 */
export function getEphemerisFileset(): string {
  ensureEphePath();
  const entries = fs.readdirSync(EPHE_PATH);
  const se1Files = entries
    .filter((name) => name.toLowerCase().endsWith(".se1"))
    .sort(); // Deterministic ordering

  if (!se1Files.length) {
    throw new Error("No .se1 files found in ephemeris directory");
  }

  // Create deterministic identifier from file list and sizes
  const fileInfo = se1Files
    .map((name) => {
      const filePath = path.join(EPHE_PATH, name);
      const stats = fs.statSync(filePath);
      return `${name}:${stats.size}`;
    })
    .join("|");

  const hash = crypto.createHash("sha256").update(fileInfo).digest("hex");
  const shortHash = hash.slice(0, 16); // 16 hex chars = 64 bits

  // Also include file count and date range hint if available
  const fileCount = se1Files.length;
  const yearHints = se1Files
    .map((name) => {
      const match = name.match(/_(\d+)/);
      return match ? match[1] : null;
    })
    .filter((y): y is string => y !== null)
    .sort()
    .join("-");

  if (yearHints) {
    return `se-${fileCount}files-${yearHints}-${shortHash}`;
  }
  return `se-${fileCount}files-${shortHash}`;
}

const BODY_MAP: Record<string, number> = {
  sun: swe.SE_SUN,
  moon: swe.SE_MOON,
  mercury: swe.SE_MERCURY,
  venus: swe.SE_VENUS,
  mars: swe.SE_MARS,
  jupiter: swe.SE_JUPITER,
  saturn: swe.SE_SATURN,
  uranus: swe.SE_URANUS,
  neptune: swe.SE_NEPTUNE,
  pluto: swe.SE_PLUTO,
};

export function julianDayFor(date: string, hourUTC: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("Invalid date format; expected YYYY-MM-DD");
  }
  if (!Number.isFinite(hourUTC) || hourUTC < 0 || hourUTC > 24) {
    throw new Error("Invalid hourUTC; expected 0–24");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  init();
  const jd = swe.swe_julday(year, month, day, hourUTC, swe.SE_GREG_CAL);
  if (!Number.isFinite(jd)) {
    throw new Error("Failed to compute Julian Day");
  }
  return jd;
}

export function calcBody(jd: number, body: string) {
  if (!Number.isFinite(jd)) {
    throw new Error("Invalid Julian Day");
  }
  const ipl = BODY_MAP[body];
  if (!ipl && ipl !== 0) {
    throw new Error(`Unknown body: ${body}`);
  }

  init();
  const result = swe.swe_calc_ut(
    jd,
    ipl,
    swe.SEFLG_SWIEPH | swe.SEFLG_SPEED
  );

  if (!result || typeof result !== "object") {
    throw new Error("Swiss Ephemeris returned no result");
  }

  const flags =
    typeof (result as { rc?: number }).rc === "number"
      ? (result as { rc: number }).rc
      : typeof (result as { rflag?: number }).rflag === "number"
        ? (result as { rflag: number }).rflag
        : typeof (result as { flag?: number }).flag === "number"
          ? (result as { flag: number }).flag
          : undefined;

  if (typeof flags === "number" && flags < 0) {
    const err = (result as { serr?: string }).serr;
    throw new Error(err || "Swiss Ephemeris calculation failed");
  }

  let longitude: number | undefined;
  let latitude: number | undefined;
  let distance_au: number | undefined;
  let speed_deg_per_day: number | undefined;

  if (Array.isArray((result as { xx?: unknown[] }).xx)) {
    const [lo, la, dist, speed] = (result as { xx: number[] }).xx;
    longitude = lo;
    latitude = la;
    distance_au = dist;
    speed_deg_per_day = speed;
  } else if (typeof (result as { longitude?: number }).longitude === "number") {
    longitude = (result as { longitude: number }).longitude;
    latitude = (result as { latitude?: number }).latitude;
    distance_au = (result as { distance?: number }).distance;
    speed_deg_per_day = (result as { longitudeSpeed?: number }).longitudeSpeed;
  }

  if (
    longitude === undefined ||
    latitude === undefined ||
    distance_au === undefined ||
    speed_deg_per_day === undefined
  ) {
    const keys = Object.keys(result).join(", ") || "none";
    throw new Error(
      `Swiss Ephemeris returned invalid data (keys: ${keys}).`
    );
  }

  if (typeof flags === "number" && (flags & swe.SEFLG_MOSEPH)) {
    throw new Error(
      "Swiss Ephemeris fell back to Moshier (SEFLG_MOSEPH) unexpectedly"
    );
  }

  return {
    longitude,
    latitude,
    distance_au,
    speed_deg_per_day,
    retrograde: speed_deg_per_day < 0,
    flags,
  };
}

