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

export function buildIntroScaffold(params: {
  episode_date: string;
  axis: string;
  why_today_clause: string;
  sky_anchors?: SkyAnchor[];
  ingress_notes?: { body: "Moon" | "Sun"; current: string; next: string }[];
}): string {
  const dateStr = formatBroadcastDate(params.episode_date);

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

  return [
    `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${dateStr}.`,
    `Today’s dominant tension is: ${params.axis}.`,
    params.why_today_clause,
    ...anchorLines,
    ...ingressLines,
  ].join("\n");
}

