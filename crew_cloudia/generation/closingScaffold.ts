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

export function buildClosingScaffold(params: {
  episode_date: string;
  axis_statement: string;
  timing_note?: string;
}): { scaffold: string; signoff: string } {
  const dateStr = formatBroadcastDate(params.episode_date);
  const framing = "As the day winds down, take a moment to notice how this energy has shown up for you.";
  const bridge = params.timing_note
    ? `This was a day shaped by ${params.axis_statement} (${params.timing_note}).`
    : `Today revolved around ${params.axis_statement}.`;
  const signoff = `The Cosmic Forecast for ${dateStr} is brought to you by the Intergalactic Public Broadcasting Network.\nWe’ll be back tomorrow, skygazer.`;

  return {
    scaffold: [framing, bridge].join("\n"),
    signoff,
  };
}

