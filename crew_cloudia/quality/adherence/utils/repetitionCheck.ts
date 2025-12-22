import { normalizeText } from "./textNormalization.js";

export type RepetitionWindowKind = "head" | "tail";

export type RepetitionCheckResult = {
  exactMatch: boolean;
  highestOverlap: number;
  matchedWith?: string;
  matchedWindow?: RepetitionWindowKind;
  windowSize: number;
};

const MIN_WINDOW = 12;
const MAX_WINDOW = 20;

const tokenize = (text: string): string[] => normalizeText(text).split(" ").filter(Boolean);

const sliceWindow = (tokens: string[], kind: RepetitionWindowKind): string[] => {
  if (tokens.length === 0) return [];
  const size = Math.min(MAX_WINDOW, Math.max(MIN_WINDOW, tokens.length));
  if (kind === "head") {
    return tokens.slice(0, Math.min(size, tokens.length));
  }
  return tokens.slice(Math.max(tokens.length - size, 0));
};

const overlapRatio = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return intersection / Math.max(a.length, b.length);
};

export function checkClosingRepetition(current: string, previous: string[]): RepetitionCheckResult {
  const currentTokens = tokenize(current);
  const currentHead = sliceWindow(currentTokens, "head");
  const currentTail = sliceWindow(currentTokens, "tail");

  let exactMatch = false;
  let highestOverlap = 0;
  let matchedWith: string | undefined;
  let matchedWindow: RepetitionWindowKind | undefined;
  let windowSize = Math.min(Math.max(currentTokens.length, MIN_WINDOW), MAX_WINDOW);

  for (const prior of previous) {
    const priorTokens = tokenize(prior);
    const priorHead = sliceWindow(priorTokens, "head");
    const priorTail = sliceWindow(priorTokens, "tail");

    const headMatch = currentHead.join(" ") === priorHead.join(" ");
    const tailMatch = currentTail.join(" ") === priorTail.join(" ");
    if (headMatch || tailMatch) {
      exactMatch = true;
      matchedWith = prior;
      matchedWindow = headMatch ? "head" : "tail";
      windowSize = (matchedWindow === "head" ? currentHead.length : currentTail.length) || windowSize;
      break;
    }

    const headOverlap = overlapRatio(currentHead, priorHead);
    if (headOverlap > highestOverlap) {
      highestOverlap = headOverlap;
      matchedWith = prior;
      matchedWindow = "head";
      windowSize = currentHead.length;
    }

    const tailOverlap = overlapRatio(currentTail, priorTail);
    if (tailOverlap > highestOverlap) {
      highestOverlap = tailOverlap;
      matchedWith = prior;
      matchedWindow = "tail";
      windowSize = currentTail.length;
    }
  }

  return { exactMatch, highestOverlap, matchedWith, matchedWindow, windowSize };
}

