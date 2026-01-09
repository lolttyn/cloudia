export function formatBroadcastDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayName = dayNames[parsed.getUTCDay()];
  const monthName = monthNames[parsed.getUTCMonth()];
  const dayOfMonth = parsed.getUTCDate();
  const year = parsed.getUTCFullYear();

  return `${dayName}, ${monthName} ${dayOfMonth}, ${year}`;
}

import { SkyAnchor } from "../interpretation/schema/InterpretiveFrame.js";

const INGRESS_SENSITIVE_BODIES = ["moon_sign", "sun_sign"] as const;

/**
 * Builds the exact greeting string expected by the validator.
 * Must match expectedIntroGreeting() in evaluateIntroWithFrame.ts exactly.
 */
function buildExpectedGreeting(episode_date: string): string {
  const parsed = new Date(`${episode_date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return `Hey Celestial Besties. It's me, Cloudia Rey, here with the Cosmic Forecast for ${episode_date}.`;
  }
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayName = dayNames[parsed.getUTCDay()];
  const monthName = monthNames[parsed.getUTCMonth()];
  const dayOfMonth = parsed.getUTCDate();
  const year = parsed.getUTCFullYear();

  return `Hey Celestial Besties. It's me, Cloudia Rey, here with the Cosmic Forecast for ${dayName}, ${monthName} ${dayOfMonth}, ${year}.`;
}

export function buildIntroScaffold(params: {
  episode_date: string;
  axis_primary: string;
  axis_counter: string;
  why_today_clause: string;
  sky_anchors?: SkyAnchor[];
  ingress_notes?: { body: "Moon" | "Sun"; current: string; next: string }[];
}): string {
  // Use exact greeting format expected by validator (verbatim requirement)
  const greeting = buildExpectedGreeting(params.episode_date);

  const ingressSensitiveAnchors =
    params.sky_anchors?.filter((a) => INGRESS_SENSITIVE_BODIES.includes(a.type as any)) ?? [];

  const anchorLines =
    ingressSensitiveAnchors.length > 0
      ? ingressSensitiveAnchors.map((a) => `Sky anchor: ${a.label}`)
      : [];

  const ingressLines =
    params.ingress_notes?.map(
      (n) => `The ${n.body} is in ${n.current} today and enters ${n.next} soon.`
    ) ?? [];

  // Do NOT include axis statement in scaffold - it gets inserted verbatim and contains banned phrases
  // The axis should be expressed naturally in the LLM-generated micro content that follows the scaffold
  return [
    greeting,
    params.why_today_clause,
    ...anchorLines,
    ...ingressLines,
  ].join("\n");
}

