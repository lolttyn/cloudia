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
  axis_primary: string;
  axis_counter: string;
  timing_note?: string;
  temporal_phase: "building" | "peak" | "releasing" | "aftershock" | "baseline";
}): { scaffold: string; signoff: string } {
  const dateStr = formatBroadcastDate(params.episode_date);
  const framing = "As the day winds down, just notice how this vibe actually showed up for you.";
  // Do NOT include axis statement in scaffold - it gets inserted verbatim and contains banned phrases like "meaning over minutiae"
  // The axis should be expressed naturally in the LLM-generated micro content between scaffold and signoff
  // Only include timing note if provided, but don't reference the axis statement
  const bridge = `Today had its own rhythm.`;
  const phaseLine = `Energy is ${params.temporal_phase} right now—tune to that, don't force it.`;
  const signoff = `The Cosmic Forecast for ${dateStr} is brought to you by the Intergalactic Public Broadcasting Network.\nWe'll be back tomorrow, skygazer.`;

  return {
    scaffold: [framing, bridge, phaseLine].join("\n"),
    signoff,
  };
}

