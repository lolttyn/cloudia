/**
 * Time guard utilities for PT timezone-aware cron scheduling.
 * 
 * Uses built-in Intl APIs to avoid heavy dependencies.
 */

const PT_TIMEZONE = "America/Los_Angeles";

/**
 * Get current PT time components.
 */
function getPTTimeComponents(): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1; // 0-indexed
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value);
  const second = parseInt(parts.find((p) => p.type === "second")!.value);
  const weekday = parts.find((p) => p.type === "weekday")!.value;

  const dayOfWeekMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek: dayOfWeekMap[weekday] ?? 0,
  };
}

/**
 * Check if current PT time is Sunday at the specified hour (within minute window).
 * 
 * @param hour - Target hour (0-23)
 * @param minuteWindow - Minutes after the hour to accept (default: 15)
 * @returns true if it's Sunday and within the time window
 */
export function isSundayAtHourPT(hour: number, minuteWindow: number = 15): boolean {
  const pt = getPTTimeComponents();
  
  if (pt.dayOfWeek !== 0) {
    // Not Sunday
    return false;
  }
  
  if (pt.hour !== hour) {
    return false;
  }
  
  return pt.minute < minuteWindow;
}

/**
 * Check if current PT time is a weekday at the specified hour (within minute window).
 * 
 * @param hour - Target hour (0-23)
 * @param minuteWindow - Minutes after the hour to accept (default: 15)
 * @returns true if it's a weekday (Mon-Fri) and within the time window
 */
export function isWeekdayAtHourPT(hour: number, minuteWindow: number = 15): boolean {
  const pt = getPTTimeComponents();
  
  // 1-5 = Monday-Friday
  if (pt.dayOfWeek < 1 || pt.dayOfWeek > 5) {
    return false;
  }
  
  if (pt.hour !== hour) {
    return false;
  }
  
  return pt.minute < minuteWindow;
}

/**
 * Get formatted PT time string for logging.
 */
export function getPTTimeString(): string {
  const pt = getPTTimeComponents();
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  return `${weekdayNames[pt.dayOfWeek]} ${String(pt.month + 1).padStart(2, "0")}/${String(pt.day).padStart(2, "0")}/${pt.year} ${String(pt.hour).padStart(2, "0")}:${String(pt.minute).padStart(2, "0")}:${String(pt.second).padStart(2, "0")} PT`;
}

/**
 * Get today's date in PT timezone as YYYY-MM-DD.
 */
export function getTodayPT(): string {
  const pt = getPTTimeComponents();
  return `${pt.year}-${String(pt.month + 1).padStart(2, "0")}-${String(pt.day).padStart(2, "0")}`;
}
