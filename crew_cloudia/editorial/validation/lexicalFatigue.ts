import { SegmentPromptInput } from "../contracts/segmentPromptInput.js";

export const LEXICAL_WINDOW_DAYS = 3;
export const FATIGUE_WARNING = 40;
export const FATIGUE_REWRITE = 60;
export const FATIGUE_BLOCK = 75;

const METAPHOR_STEMS = [
  "noise",
  "static",
  "space",
  "container",
  "ground",
  "settle",
  "shift",
  "pull",
  "nudge",
];

type SegmentKey = SegmentPromptInput["segment_key"];

type SegmentScript = {
  episode_date: string;
  segment_key: SegmentKey;
  script_text: string;
};

type LexicalHistoryFetcher = (params: {
  episode_date: string;
  window_days: number;
}) => Promise<SegmentScript[]>;

export type LexicalFatigueResult = {
  score: number;
  repeated_phrases: string[];
  repeated_openings: string[];
  metaphor_conflicts: string[];
  structural_echo: boolean;
  window_days: number;
};

export type LexicalFatigueSeverity = "ok" | "warning" | "rewrite" | "block";

export type LexicalFatigueEvaluation = {
  result: LexicalFatigueResult;
  severity: LexicalFatigueSeverity;
  instructions: string[];
};

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text: string): string[] =>
  normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 0);

const extractNGrams = (tokens: string[], min = 2, max = 5): string[] => {
  const grams: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let len = min; len <= max; len++) {
      if (i + len > tokens.length) continue;
      grams.push(tokens.slice(i, i + len).join(" "));
    }
  }
  return grams;
};

const extractSentenceOpenings = (text: string): { opening: string; is_first: boolean }[] => {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const openings: { opening: string; is_first: boolean }[] = [];
  sentences.forEach((sentence, index) => {
    const tokens = tokenize(sentence);
    if (tokens.length === 0) return;
    const prefix = tokens.slice(0, Math.min(6, tokens.length)).join(" ");
    openings.push({ opening: prefix, is_first: index === 0 });
  });

  return openings;
};

const detectMetaphorStems = (text: string): string[] => {
  const normalized = normalizeText(text);
  return METAPHOR_STEMS.filter((stem) => new RegExp(`\\b${stem}\\w*`, "i").test(normalized));
};

const detectStructuralPattern = (text: string): string => {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const openingSentence = sentences[0] ?? "";
  const openingTokens = tokenize(openingSentence);
  let openingPattern = "other";
  if (openingTokens[0]) {
    if (/^you\b/i.test(openingSentence)) openingPattern = "you_lead";
    else if (/^today\b/i.test(openingSentence)) openingPattern = "today_lead";
    else if (/^this\b/i.test(openingSentence)) openingPattern = "this_lead";
    else if (/^(imagine|picture|consider|remember)\b/i.test(openingSentence))
      openingPattern = "invitation_lead";
  }

  const hasExample =
    /\bfor example\b/i.test(text) ||
    /\bfor instance\b/i.test(text) ||
    /\bsuch as\b/i.test(text) ||
    /\be\.g\./i.test(text) ||
    /\blike when\b/i.test(text);

  const hasPermissionLanguage =
    /\byou can\b/i.test(text) ||
    /\byou’re allowed\b/i.test(text) ||
    /\byou are allowed\b/i.test(text) ||
    /\bfeel free\b/i.test(text) ||
    /\bit['’]?s ok\b/i.test(text) ||
    /\bit['’]?s okay\b/i.test(text) ||
    /\bpermission\b/i.test(text);

  return `${openingPattern}|example:${hasExample ? "1" : "0"}|permission:${
    hasPermissionLanguage ? "1" : "0"
  }`;
};

const fetchHistoryFromSupabase: LexicalHistoryFetcher = async ({
  episode_date,
  window_days,
}) => {
  const { supabase } = await import("../../lib/supabaseClient.js");

  const startDate = new Date(`${episode_date}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - window_days);
  const startDateIso = startDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("cloudia_segments")
    .select("episode_date,segment_key,script_text")
    .gte("episode_date", startDateIso)
    .lt("episode_date", episode_date)
    .order("episode_date", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter(
      (row): row is { episode_date: string; segment_key: SegmentKey; script_text: string } =>
        typeof row.episode_date === "string" &&
        typeof row.segment_key === "string" &&
        typeof row.script_text === "string" &&
        row.script_text.trim().length > 0
    )
    .map((row) => ({
      episode_date: row.episode_date,
      segment_key: row.segment_key,
      script_text: row.script_text,
    }));
};

export async function evaluateLexicalFatigue(params: {
  episode_date: string;
  segment_key: SegmentKey;
  script_text: string;
  window_days?: number;
  fetcher?: LexicalHistoryFetcher;
}): Promise<LexicalFatigueEvaluation> {
  const window_days = params.window_days ?? LEXICAL_WINDOW_DAYS;
  const fetcher = params.fetcher ?? fetchHistoryFromSupabase;
  const script_text = params.script_text ?? "";

  const history = await fetcher({
    episode_date: params.episode_date,
    window_days,
  });

  const currentTokens = tokenize(script_text);
  const currentNgrams = new Set(extractNGrams(currentTokens));
  const currentOpenings = extractSentenceOpenings(script_text);
  const currentStems = detectMetaphorStems(script_text);
  const currentPattern = detectStructuralPattern(script_text);

  const ngramDayMap = new Map<string, Set<string>>();
  const ngramSegmentMap = new Map<string, Set<SegmentKey>>();
  const openingDayMap = new Map<string, Set<string>>();
  const openingFirstSentenceDayMap = new Map<string, Set<string>>();
  const metaphorDayMap = new Map<string, Set<string>>();
  const structuralPatterns: { date: string; pattern: string }[] = [];

  for (const entry of history) {
    const tokens = tokenize(entry.script_text);
    const ngrams = new Set(extractNGrams(tokens));
    const openings = extractSentenceOpenings(entry.script_text);
    const stems = new Set(detectMetaphorStems(entry.script_text));
    const pattern = detectStructuralPattern(entry.script_text);

    ngrams.forEach((ngram) => {
      if (!ngramDayMap.has(ngram)) ngramDayMap.set(ngram, new Set());
      if (!ngramSegmentMap.has(ngram)) ngramSegmentMap.set(ngram, new Set());
      ngramDayMap.get(ngram)?.add(entry.episode_date);
      ngramSegmentMap.get(ngram)?.add(entry.segment_key);
    });

    openings.forEach((opening, index) => {
      if (!openingDayMap.has(opening.opening)) openingDayMap.set(opening.opening, new Set());
      openingDayMap.get(opening.opening)?.add(entry.episode_date);
      if (opening.is_first && index === 0) {
        if (!openingFirstSentenceDayMap.has(opening.opening)) {
          openingFirstSentenceDayMap.set(opening.opening, new Set());
        }
        openingFirstSentenceDayMap.get(opening.opening)?.add(entry.episode_date);
      }
    });

    if (entry.segment_key === params.segment_key) {
      stems.forEach((stem) => {
        if (!metaphorDayMap.has(stem)) metaphorDayMap.set(stem, new Set());
        metaphorDayMap.get(stem)?.add(entry.episode_date);
      });

      structuralPatterns.push({ date: entry.episode_date, pattern });
    }
  }

  const repeated_phrases = Array.from(currentNgrams).filter((ngram) => {
    const dayCount = ngramDayMap.get(ngram)?.size ?? 0;
    const seenInSameSegment = (ngramSegmentMap.get(ngram) ?? new Set()).has(params.segment_key);
    return dayCount >= 2 || seenInSameSegment;
  });

  const repeated_openings = currentOpenings
    .filter((opening) => {
      const historyDays = openingDayMap.get(opening.opening)?.size ?? 0;
      return historyDays + 1 >= 2 && historyDays >= 1;
    })
    .map((opening) => opening.opening);

  const metaphor_conflicts = currentStems.filter((stem) => {
    const days = metaphorDayMap.get(stem)?.size ?? 0;
    return days + 1 >= 2;
  });

  const structuralEchoSequence = [
    ...structuralPatterns,
    { date: params.episode_date, pattern: currentPattern },
  ]
    .filter((entry) => entry.pattern.length > 0)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  let structural_echo = false;
  for (let i = 0; i <= structuralEchoSequence.length - 3; i++) {
    const slice = structuralEchoSequence.slice(i, i + 3);
    if (slice.every((entry) => entry.pattern === slice[0].pattern)) {
      structural_echo = true;
      break;
    }
  }

  const score =
    Math.min(repeated_phrases.length * 20, 40) +
    repeated_openings.length * 15 +
    metaphor_conflicts.length * 10 +
    (structural_echo ? 15 : 0);

  let severity: LexicalFatigueSeverity = "ok";
  if (score >= FATIGUE_BLOCK) {
    severity = "block";
  } else if (score >= FATIGUE_REWRITE) {
    severity = "rewrite";
  } else if (score >= FATIGUE_WARNING) {
    severity = "warning";
  }

  const rewriteInstructions: string[] = [];
  repeated_phrases.forEach((phrase) => {
    rewriteInstructions.push(
      `The phrase "${phrase}" appeared in the previous ${window_days} days. Replace it with a different concrete image or remove it entirely.`
    );
  });
  repeated_openings.forEach((opening) => {
    const strongSignal = openingFirstSentenceDayMap.get(opening)?.size ?? 0;
    const openerNote =
      strongSignal > 0
        ? "It has opened this segment recently."
        : "It repeats a recent sentence opening.";
    rewriteInstructions.push(
      `${openerNote} Start with something other than "${opening}" for this ${params.segment_key} segment.`
    );
  });
  metaphor_conflicts.forEach((stem) => {
    rewriteInstructions.push(
      `The metaphor stem "${stem}" showed up in this segment across recent days. Swap to a different image or remove the metaphor language.`
    );
  });
  if (structural_echo) {
    rewriteInstructions.push(
      `The structural pattern of this ${params.segment_key} (opening tone, examples, permission language) matches the last two days. Rearrange or adjust one of those elements to break the three-day echo.`
    );
  }

  return {
    result: {
      score,
      repeated_phrases: repeated_phrases.sort(),
      repeated_openings: repeated_openings.sort(),
      metaphor_conflicts: metaphor_conflicts.sort(),
      structural_echo,
      window_days,
    },
    severity,
    instructions: rewriteInstructions,
  };
}
