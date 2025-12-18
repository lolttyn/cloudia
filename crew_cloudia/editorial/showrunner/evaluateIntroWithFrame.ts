import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

export function expectedIntroGreeting(episode_date: string): string {
  const parsed = new Date(`${episode_date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${episode_date}.`;
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

  return `Hey Celestial Besties. It’s me, Cloudia Rey, here with the Cosmic Forecast for ${dayName}, ${monthName} ${dayOfMonth}, ${year}.`;
}

export function evaluateIntroWithFrame(params: {
  interpretive_frame: InterpretiveFrame;
  episode_date: string;
  draft_script: string;
}): {
  decision: "APPROVE" | "FAIL_EPISODE";
  notes: string[];
} {
  const notes: string[] = [];
  const script = params.draft_script;
  const lower = script.toLowerCase();

  // Hard gate: greeting must be verbatim
  const greeting = expectedIntroGreeting(params.episode_date);
  if (!script.includes(greeting)) {
    notes.push("Intro greeting is missing or altered from the canonical verbatim line.");
  }

  // Hard gate: meaning coherence with dominant axis (paraphrase allowed but presence enforced via statement)
  const axis = params.interpretive_frame.dominant_contrast_axis.statement.toLowerCase();
  if (!lower.includes(axis)) {
    notes.push("Intro must reflect the dominant contrast axis (no new primary theme).");
  }

  const decision: "APPROVE" | "FAIL_EPISODE" = notes.length === 0 ? "APPROVE" : "FAIL_EPISODE";
  return { decision, notes };
}


