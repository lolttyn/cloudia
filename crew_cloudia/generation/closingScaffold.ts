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

/** Example openings for closing (passed into prompt as inspiration; scaffold rotation picks one). */
export const FRAMING_EXAMPLES = [
  "As the day winds down, just notice how this vibe actually showed up for you.",
  "Before you click off—what did today feel like in your body?",
  "However today landed, it had a shape.",
  "One more beat: how did that energy actually show up for you?",
];

/** Example bridge lines (tone; scaffold rotation picks one). */
export const BRIDGE_EXAMPLES = [
  "Today had its own rhythm.",
  "No need to fix anything—just notice.",
  "Whatever got done (or didn't) is part of the picture.",
  "Today was what it was.",
];

/** Example energy-state phrasings per phase (passed into prompt; scaffold uses one). */
export const PHASE_LINE_EXAMPLES: Record<string, string[]> = {
  building: [
    "Energy is building right now—tune to that, don't force it.",
    "Things are still gathering; you can feel the lift.",
    "The build is real—no need to push it along.",
  ],
  peak: [
    "Energy is peaking—meet it where it is.",
    "This is the crest; stay with it.",
  ],
  releasing: [
    "Energy is releasing right now—tune to that, don't force it.",
    "Things are settling; let the drop happen.",
    "The release is real—no need to hold on.",
  ],
  aftershock: [
    "The peak has passed; what's left is the echo.",
    "Energy is in aftershock—quiet clarity.",
  ],
  baseline: [
    "Energy is at a baseline—steady as it goes.",
    "No big swing today—just the usual flow.",
  ],
};

function pickByDateHash<T>(arr: T[], episodeDate: string): T {
  const index = episodeDate.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % arr.length;
  return arr[index];
}

export function buildClosingScaffold(params: {
  episode_date: string;
  axis_primary: string;
  axis_counter: string;
  timing_note?: string;
  temporal_phase: "building" | "peak" | "releasing" | "aftershock" | "baseline";
}): { scaffold: string; signoff: string } {
  const dateStr = formatBroadcastDate(params.episode_date);
  const framing = pickByDateHash(FRAMING_EXAMPLES, params.episode_date);
  const bridge = pickByDateHash(BRIDGE_EXAMPLES, params.episode_date);
  const phaseLines = PHASE_LINE_EXAMPLES[params.temporal_phase] ?? PHASE_LINE_EXAMPLES.baseline;
  const phaseLine = pickByDateHash(phaseLines, params.episode_date);
  const signoff = `The Cosmic Forecast for ${dateStr} is brought to you by the Intergalactic Public Broadcasting Network.\nWe'll be back tomorrow, skygazer.`;

  return {
    scaffold: [framing, bridge, phaseLine].join("\n"),
    signoff,
  };
}

