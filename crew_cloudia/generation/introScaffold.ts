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

export function buildIntroScaffold(params: {
  episode_date: string;
  axis: string;
  why_today_clause: string;
}): string {
  const dateStr = formatBroadcastDate(params.episode_date);
  return [
    `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${dateStr}.`,
    `Today’s dominant tension is: ${params.axis}.`,
    params.why_today_clause,
  ].join("\n");
}

