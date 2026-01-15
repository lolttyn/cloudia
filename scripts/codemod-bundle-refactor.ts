#!/usr/bin/env npx tsx
/**
 * Canon Bundle Refactoring Codemod
 * 
 * Phase 1: In-place improvements to remove admin metaphors, enforce quotas,
 * and maintain bundle-specificity using two-layer content generation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// DWU P1.1: Global Lived-World Bank (sign-agnostic concrete substrate)
// ============================================================================

const SETTINGS = [
  "kitchen", "hallway", "street", "bedroom", "doorway", "sink", "window",
  "threshold", "corner", "edge", "door", "room", "space", "surface", "floor",
  "wall", "table", "counter", "stair", "path", "sidewalk", "crosswalk",
  "bus stop", "line", "queue", "waiting area", "entryway", "exit", "porch",
  "yard", "garden", "park", "bench", "seat", "chair", "couch", "bed"
];

const OBJECTS = [
  "keys", "mug", "drawer", "towel", "bag", "receipt", "shoes", "light",
  "door", "surface", "cup", "plate", "bowl", "spoon", "fork", "knife",
  "book", "paper", "pen", "pencil", "notebook", "phone", "wallet", "jacket",
  "coat", "hat", "scarf", "gloves", "umbrella", "bag", "backpack", "purse",
  "watch", "ring", "bracelet", "necklace", "glasses", "sunglasses", "mirror",
  "picture", "frame", "plant", "flower", "vase", "candle", "lamp", "switch"
];

const BODY_TOKENS = [
  "jaw", "shoulders", "breath", "sleep", "appetite", "pulse", "tension",
  "stomach", "hands", "skin", "chest", "heart", "gut", "back", "neck",
  "forehead", "brow", "eyes", "mouth", "lips", "teeth", "tongue", "throat",
  "voice", "ears", "nose", "hair", "fingers", "toes", "feet", "legs",
  "arms", "knees", "elbows", "wrists", "ankles", "spine", "muscle", "bone"
];

const ACTIONS = [
  "wipe", "sort", "step outside", "pause", "adjust", "fold", "rinse",
  "arrange", "gather", "settle", "breathe", "stretch", "sit", "stand",
  "walk", "move", "reach", "touch", "hold", "release", "open", "close",
  "turn", "shift", "lean", "rest", "wait", "listen", "look", "see",
  "notice", "feel", "sense", "taste", "smell", "hear", "speak", "say",
  "whisper", "laugh", "smile", "frown", "nod", "shake", "wave", "hug"
];

const SOCIAL_BEATS = [
  "conversation", "boundary", "space", "waiting", "silence", "noise",
  "touch", "voice", "apology", "thanks", "greeting", "farewell", "hello",
  "goodbye", "please", "sorry", "excuse", "permission", "invitation",
  "decline", "accept", "offer", "request", "question", "answer", "response",
  "reaction", "interaction", "exchange", "connection", "disconnection",
  "presence", "absence", "attention", "ignoring", "listening", "talking"
];

// ============================================================================
// DWU P1.2: VocabMap Extraction (modifiers only)
// ============================================================================

interface SignVocabulary {
  core_meanings: string[];
  supporting_themes?: string[];
  axis_primary?: string;
  axis_counter?: string;
  tone?: string;
}

function loadInterpretiveCanon(): Record<string, any> {
  const canonPath = path.resolve(
    __dirname,
    "../crew_cloudia/interpretation/canon/interpretiveCanon_v1.json"
  );
  const raw = fs.readFileSync(canonPath, "utf-8");
  return JSON.parse(raw);
}

function buildVocabMap(canon: any): Map<string, SignVocabulary> {
  const vocabMap = new Map<string, SignVocabulary>();

  // Extract from moon_signs
  for (const [sign, entry] of Object.entries(canon.moon_signs || {})) {
    const e = entry as any;
    vocabMap.set(`moon_${sign.toLowerCase()}`, {
      core_meanings: e.core_meanings || [],
      supporting_themes: e.supporting_themes || [],
      axis_primary: e.dominant_axis?.primary,
      axis_counter: e.dominant_axis?.counter,
      tone: e.tone,
    });
  }

  // Extract from sun_signs
  for (const [sign, entry] of Object.entries(canon.sun_signs || {})) {
    const e = entry as any;
    vocabMap.set(`sun_${sign.toLowerCase()}`, {
      core_meanings: e.core_meanings || [],
      supporting_themes: e.modulates || [],
      tone: undefined, // sun_signs don't have tone
    });
  }

  return vocabMap;
}

// ============================================================================
// Taxonomy Classification (with fallbacks)
// ============================================================================

type BundleCategory =
  | "moon_in_sign"
  | "sun_in_sign"
  | "moon_phase"
  | "aspect"
  | "retrograde"
  | "lunation"
  | "other";

function classifyBundle(bundle: any, filename: string): BundleCategory {
  // Layer 1: Prefer trigger.signal_key
  const key = bundle.trigger?.signal_key;
  if (key) {
    if (key.startsWith("moon_in_")) return "moon_in_sign";
    if (key.startsWith("sun_in_")) return "sun_in_sign";
    if (key.startsWith("moon_phase_")) return "moon_phase";
    if (
      key.includes("_square_") ||
      key.includes("_conjunction_") ||
      key.includes("_opposition_") ||
      key.includes("_trine_") ||
      key.includes("_sextile_")
    )
      return "aspect";
    if (key.includes("retrograde")) return "retrograde";
    if (key.startsWith("new_moon_in_") || key.startsWith("full_moon_in_"))
      return "lunation";
  }

  // Layer 2: Fallback to filename stem
  const stem = filename.replace(/\.v\d+\.json$/, "").toLowerCase();
  if (stem.startsWith("moon_in_")) return "moon_in_sign";
  if (stem.startsWith("sun_in_")) return "sun_in_sign";
  if (stem.startsWith("moon_phase_")) return "moon_phase";
  if (
    stem.includes("_square_") ||
    stem.includes("_conjunction_") ||
    stem.includes("_opposition_") ||
    stem.includes("_trine_") ||
    stem.includes("_sextile_")
  )
    return "aspect";
  if (stem.includes("retrograde")) return "retrograde";
  if (stem.startsWith("new_moon_in_") || stem.startsWith("full_moon_in_"))
    return "lunation";

  // Layer 3: Fallback to id/slug
  const id = bundle.id || bundle.slug;
  if (id) {
    const idLower = id.toLowerCase();
    if (idLower.startsWith("moon_in_")) return "moon_in_sign";
    if (idLower.startsWith("sun_in_")) return "sun_in_sign";
    if (idLower.startsWith("moon_phase_")) return "moon_phase";
    if (
      idLower.includes("_square_") ||
      idLower.includes("_conjunction_") ||
      idLower.includes("_opposition_") ||
      idLower.includes("_trine_") ||
      idLower.includes("_sextile_")
    )
      return "aspect";
    if (idLower.includes("retrograde")) return "retrograde";
    if (idLower.startsWith("new_moon_in_") || idLower.startsWith("full_moon_in_"))
      return "lunation";
  }

  return "other";
}

// ============================================================================
// Quality Gates (Lint Rules)
// ============================================================================

const ADMIN_PATTERNS = [
  /\bcalendar (invite|invites|details)\b/i,
  /\binbox triage\b|\btriage (your|the) inbox\b/i,
  /\bre-?reading (an|the) (email|message)\b/i,
  /\bre-?reading the same (email|message)\b/i,
  /\bdouble-?checking (a|the) (calendar|invite|email|message|details)\b/i,
  /\b(one more )?(tiny|small) correction\b/i,
  /\b(admin|life admin|paperwork)\b/i,
  /\bmeetings?\b/i, // in context of scheduling/organizing
];

const CLICHE_STEMS = [
  "you might notice",
  "it's easy to",
  "there's a pull",
  "a quiet",
  "it's okay to",
  "you can",
  "this is",
  "there is",
];

const ABSTRACT_NOUNS = ["meaning", "values", "beliefs", "themes", "concepts"];

const GROUNDED_TOKENS = {
  settings: SETTINGS,
  objects: OBJECTS,
  body: BODY_TOKENS,
  actions: ACTIONS,
};

function extractStem(text: string): string {
  // Extract first 3-5 words as stem
  const words = text.toLowerCase().trim().split(/\s+/).slice(0, 5);
  return words.join(" ");
}

function checkAdminMetaphors(text: string): string[] {
  const found: string[] = [];
  for (const pattern of ADMIN_PATTERNS) {
    if (pattern.test(text)) {
      found.push(pattern.source);
    }
  }
  return found;
}

function checkAbstractGrounded(text: string): boolean {
  const hasAbstract = ABSTRACT_NOUNS.some((noun) =>
    text.toLowerCase().includes(noun)
  );
  if (!hasAbstract) return true;

  const allGrounded = Object.values(GROUNDED_TOKENS).flat();
  const hasGrounded = allGrounded.some((token) =>
    text.toLowerCase().includes(token)
  );

  return hasGrounded;
}

function checkStemCaps(
  items: string[],
  bundleItems: string[]
): { violations: { stem: string; count: number }[] } {
  const violations: { stem: string; count: number }[] = [];
  const stemCounts = new Map<string, number>();

  // Count stems in this array
  for (const item of items) {
    const stem = extractStem(item);
    for (const clicheStem of CLICHE_STEMS) {
      if (stem.startsWith(clicheStem.toLowerCase())) {
        stemCounts.set(clicheStem, (stemCounts.get(clicheStem) || 0) + 1);
      }
    }
  }

  // Check per-array cap (max 1)
  for (const [stem, count] of stemCounts.entries()) {
    if (count > 1) {
      violations.push({ stem, count });
    }
  }

  // Check per-bundle cap (max 2 total)
  const bundleStemCounts = new Map<string, number>();
  for (const item of bundleItems) {
    const stem = extractStem(item);
    for (const clicheStem of CLICHE_STEMS) {
      if (stem.startsWith(clicheStem.toLowerCase())) {
        bundleStemCounts.set(
          clicheStem,
          (bundleStemCounts.get(clicheStem) || 0) + 1
        );
      }
    }
  }

  for (const [stem, count] of bundleStemCounts.entries()) {
    if (count > 2) {
      violations.push({ stem, count });
    }
  }

  return { violations };
}

function checkRepetition(items: string[]): string[] {
  const stems = items.map(extractStem);
  const duplicates: string[] = [];
  const seen = new Set<string>();

  for (const stem of stems) {
    if (seen.has(stem)) {
      duplicates.push(stem);
    }
    seen.add(stem);
  }

  return duplicates;
}

// ============================================================================
// Transformation Logic
// ============================================================================

function removeAdminMetaphors(text: string, vocab: SignVocabulary): string {
  let result = text;

  // Replace admin metaphors with lived-world bank alternatives
  result = result.replace(
    /\bclearing inboxes\b/gi,
    "organizing physical spaces"
  );
  result = result.replace(
    /\binbox triage\b/gi,
    "sorting through accumulated items"
  );
  result = result.replace(
    /\bdouble-?checking (information|timelines|dependencies|details)\b/gi,
    "reviewing details with fresh perspective"
  );
  result = result.replace(
    /\bre-?reading (an|the) (email|message)\b/gi,
    "revisiting past conversations"
  );
  result = result.replace(
    /\bcalendar (invite|invites|details)\b/gi,
    "scheduling considerations"
  );
  // Replace "to-do lists" and similar
  result = result.replace(
    /\bto-?do lists?\b/gi,
    "accumulated tasks"
  );
  result = result.replace(
    /\b(checklists?|task lists?)\b/gi,
    "organized steps"
  );
  // Replace "meetings" - in canon bundles, this is always an admin metaphor
  result = result.replace(/\bmeetings?\b/gi, "conversations");

  return result;
}

function rewriteWithLivedWorld(
  text: string,
  vocab: SignVocabulary
): string {
  // Use vocabMap modifiers to tilt framing, but build from lived-world bank
  const lower = text.toLowerCase();

  // Check if text has abstract nouns without grounding
  const hasAbstract = ABSTRACT_NOUNS.some((noun) => lower.includes(noun));
  const hasGrounded = Object.values(GROUNDED_TOKENS).flat().some((token) =>
    lower.includes(token)
  );

  if (hasAbstract && !hasGrounded) {
    // Replace abstract nouns with concrete lived-world alternatives
    let result = text;

    // Replace "values" with concrete referents
    if (lower.includes("values") || lower.includes("guiding values")) {
      const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
      const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
      const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      if (lower.includes("reconnecting with")) {
        result = result.replace(
          /\bReconnecting with (guiding )?values\b/gi,
          `Reconnecting with what matters—notice it in the ${setting}, the ${object} you reach for, the way you ${action}`
        );
      } else {
        result = result.replace(
          /\b(guiding )?values\b/gi,
          `what matters to you—notice it in the ${setting}, the ${object} you choose`
        );
      }
    }

    // Replace "meaningful" with concrete referents
    if (lower.includes("meaningful")) {
      const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      const body = BODY_TOKENS[Math.floor(Math.random() * BODY_TOKENS.length)];
      const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
      if (lower.includes("nothing meaningful can")) {
        result = result.replace(
          /\bNothing meaningful can change\b/gi,
          `Nothing real can shift—notice how your ${body} responds in the ${setting} when you ${action}`
        );
      } else {
        result = result.replace(
          /\bmeaningful\b/gi,
          `real—notice how your ${body} responds when you ${action}`
        );
      }
    }

    // Replace "meaning" with concrete referents
    if (lower.includes("meaning") && !lower.includes("meaningful")) {
      const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
      const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
      result = result.replace(
        /\bmeaning\b/gi,
        `purpose—see it in the ${setting}, the ${object} you reach for`
      );
    }

    // If still abstract after replacement, add concrete anchor
    const stillAbstract = ABSTRACT_NOUNS.some((noun) =>
      result.toLowerCase().includes(noun)
    );
    const nowGrounded = Object.values(GROUNDED_TOKENS).flat().some((token) =>
      result.toLowerCase().includes(token)
    );

    if (stillAbstract && !nowGrounded) {
      const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
      const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
      const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];

      // Tilt with vocab modifier
      if (
        vocab.axis_primary === "precision" ||
        vocab.core_meanings.includes("refinement")
      ) {
        return `${result} Notice how this shows up in the ${setting}, with ${object} and the way you ${action}.`;
      } else if (
        vocab.axis_primary === "meaning" ||
        vocab.core_meanings.includes("trajectory")
      ) {
        return `${result} See how this connects to the ${setting}, the ${object} you hold, the ${action} you choose.`;
      } else {
        return `${result} Notice the ${setting}, the ${object}, the way you ${action}.`;
      }
    }

    return result;
  }

  return text;
}

function expandArray(
  items: string[],
  minCount: number,
  vocab: SignVocabulary,
  allBundleItems: string[]
): string[] {
  if (items.length >= minCount) return items;

  const result = [...items];
  const needed = minCount - items.length;

  // First, try rewriting existing items
  for (let i = 0; i < Math.min(needed, items.length); i++) {
    const rewritten = rewriteWithLivedWorld(items[i], vocab);
    if (rewritten !== items[i] && !result.includes(rewritten)) {
      result.push(rewritten);
    }
  }

  // Then generate new items by recombining lived-world bank + modifiers
  let attempts = 0;
  const maxAttempts = 50;
  while (result.length < minCount && attempts < maxAttempts) {
    attempts++;
    const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
    const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
    const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    const body = BODY_TOKENS[Math.floor(Math.random() * BODY_TOKENS.length)];
    const social = SOCIAL_BEATS[Math.floor(Math.random() * SOCIAL_BEATS.length)];

    // Use vocab to tilt framing - generate more natural combinations
    let newItem = "";
    if (vocab.axis_primary === "precision" || vocab.core_meanings.includes("refinement")) {
      // Precision: focus on details, careful actions
      newItem = `Notice the ${setting}, how you ${action} with attention to the ${object}, your ${body} aware.`;
    } else if (vocab.axis_primary === "meaning" || vocab.core_meanings.includes("trajectory")) {
      // Meaning: broader connections
      newItem = `See how the ${setting} connects to the ${object}, the way you ${action}, the ${social} that follows.`;
    } else if (vocab.axis_primary === "structure" || vocab.core_meanings.includes("structure")) {
      // Structure: deliberate, organized
      newItem = `The ${setting} offers a place to ${action}, the ${object} in its place, your ${body} steady.`;
    } else {
      // Default: balanced, observational
      newItem = `Notice the ${setting}, the ${object} you reach for, how you ${action}, your ${body} responding.`;
    }

    // Check for duplicates and repetition
    const stem = extractStem(newItem);
    const hasDuplicate = result.some((item) => extractStem(item) === stem);
    const wouldRepeat = checkRepetition([...result, newItem]).length > 0;
    
    if (!hasDuplicate && !wouldRepeat) {
      result.push(newItem);
    }
  }

  return result.slice(0, minCount);
}

function transformBundle(
  bundle: any,
  vocabMap: Map<string, SignVocabulary>,
  filename: string
): {
  bundle: any;
  changes: {
    field: string;
    original: string[];
    replacement: string[];
  }[];
} {
  const category = classifyBundle(bundle, filename);
  const changes: { field: string; original: string[]; replacement: string[] }[] = [];

  // Extract sign for vocab lookup
  let vocab: SignVocabulary = { core_meanings: [] };
  if (category === "moon_in_sign") {
    const signMatch = filename.match(/moon_in_(\w+)\./i);
    if (signMatch) {
      const sign = signMatch[1].toLowerCase();
      vocab = vocabMap.get(`moon_${sign}`) || { core_meanings: [] };
    }
  }

  // Collect all bundle items for stem cap checking
  const allBundleItems: string[] = [
    ...(bundle.meaning?.opportunities || []),
    ...(bundle.guidance?.do || []),
    ...(bundle.meaning?.frames?.map((f: any) => f.text) || []),
  ];

  // Transform opportunities[]
  if (bundle.meaning?.opportunities) {
    const original = [...bundle.meaning.opportunities];
    let transformed = original.map((item: string) => {
      let result = removeAdminMetaphors(item, vocab);
      result = rewriteWithLivedWorld(result, vocab);
      return result;
    });

    // Remove duplicates
    transformed = Array.from(new Set(transformed));

    // Expand to minimum quota
    transformed = expandArray(transformed, 6, vocab, allBundleItems);

    bundle.meaning.opportunities = transformed;
    if (JSON.stringify(original) !== JSON.stringify(transformed)) {
      changes.push({
        field: "meaning.opportunities",
        original,
        replacement: transformed,
      });
    }
  }

  // Transform do[]
  if (bundle.guidance?.do) {
    const original = [...bundle.guidance.do];
    let transformed = original.map((item: string) => {
      let result = removeAdminMetaphors(item, vocab);
      result = rewriteWithLivedWorld(result, vocab);
      return result;
    });

    // Remove duplicates
    transformed = Array.from(new Set(transformed));

    // Expand to minimum quota
    transformed = expandArray(transformed, 6, vocab, allBundleItems);

    bundle.guidance.do = transformed;
    if (JSON.stringify(original) !== JSON.stringify(transformed)) {
      changes.push({
        field: "guidance.do",
        original,
        replacement: transformed,
      });
    }
  }

  // Transform frames[]
  if (bundle.meaning?.frames) {
    const original = bundle.meaning.frames.map((f: any) => ({ ...f }));
    let transformed = bundle.meaning.frames.map((frame: any) => {
      let text = removeAdminMetaphors(frame.text, vocab);
      text = rewriteWithLivedWorld(text, vocab);
      return { ...frame, text };
    });

    // Remove duplicates by text
    const seenTexts = new Set<string>();
    transformed = transformed.filter((frame: any) => {
      if (seenTexts.has(frame.text)) return false;
      seenTexts.add(frame.text);
      return true;
    });

    // Expand to minimum quota if needed
    if (transformed.length < 5) {
      const needed = 5 - transformed.length;
      for (let i = 0; i < needed; i++) {
        const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
        const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
        const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];

        const social = SOCIAL_BEATS[Math.floor(Math.random() * SOCIAL_BEATS.length)];
        let newText = "";
        if (vocab.axis_primary === "precision" || vocab.core_meanings.includes("refinement")) {
          newText = `Notice the ${setting}, how you ${action} with attention to the ${object}.`;
        } else if (vocab.axis_primary === "meaning" || vocab.core_meanings.includes("trajectory")) {
          newText = `See how the ${setting} connects to the ${object}, the way you ${action}, the ${social} that follows.`;
        } else {
          newText = `Notice the ${setting}, the ${object} you reach for, how you ${action}.`;
        }

        transformed.push({
          speakability: "can_say",
          text: newText,
        });
      }
    }

    bundle.meaning.frames = transformed;
    if (JSON.stringify(original) !== JSON.stringify(transformed)) {
      changes.push({
        field: "meaning.frames",
        original: original.map((f: any) => f.text),
        replacement: transformed.map((f: any) => f.text),
      });
    }
  }

  // Add meta fields
  if (!bundle.meta) {
    bundle.meta = {};
  }
  bundle.meta.source_version = "refactored_v1";
  bundle.meta.avoid_tokens = ["inbox", "calendar", "email", "double-check", "triage"];

  return { bundle, changes };
}

// ============================================================================
// Analysis Functions
// ============================================================================

function extractTemplateStems(items: string[]): Map<string, number> {
  const stems = new Map<string, number>();
  for (const item of items) {
    const stem = extractStem(item);
    stems.set(stem, (stems.get(stem) || 0) + 1);
  }
  return stems;
}

function analyzeBigramsTrigrams(items: string[]): {
  bigrams: Map<string, number>;
  trigrams: Map<string, number>;
} {
  const bigrams = new Map<string, number>();
  const trigrams = new Map<string, number>();

  for (const item of items) {
    const words = item.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      trigrams.set(trigram, (trigrams.get(trigram) || 0) + 1);
    }
  }

  return { bigrams, trigrams };
}

// ============================================================================
// Main Execution
// ============================================================================

interface AuditReport {
  timestamp: string;
  taxonomy_processed: string[];
  files_changed: string[];
  removed_admin_metaphors: {
    file: string;
    field: string;
    original: string;
    replacement: string;
  }[];
  removed_cliches: {
    file: string;
    field: string;
    phrase: string;
  }[];
  expansions: {
    file: string;
    field: string;
    before_count: number;
    after_count: number;
    new_items: string[];
  }[];
  flagged_for_review: {
    file: string;
    reason: string;
    context: string;
  }[];
  bigram_trigram_analysis: {
    top_20_bigrams: [string, number][];
    top_20_trigrams: [string, number][];
    template_stems: [string, number][];
  };
  cross_bundle_similarity: {
    taxonomy: string;
    top_stems: [string, number][];
    flagged_stems: string[];
  }[];
  validation_errors: {
    file: string;
    rule: string;
    message: string;
  }[];
}

function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate-only");
  const dryRun = args.includes("--dry-run");
  const taxonomyArg = args.find((a) => a.startsWith("--taxonomy"));
  const targetTaxonomy = taxonomyArg
    ? taxonomyArg.split("=")[1] || "moon_in_sign"
    : "moon_in_sign";

  const bundlesDir = path.resolve(
    __dirname,
    "../crew_cloudia/canon/machine/bundles/bundles"
  );

  const canon = loadInterpretiveCanon();
  const vocabMap = buildVocabMap(canon);

  const files = fs
    .readdirSync(bundlesDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => {
      if (targetTaxonomy === "moon_in_sign") {
        return f.startsWith("moon_in_");
      }
      return true;
    });

  const audit: AuditReport = {
    timestamp: new Date().toISOString(),
    taxonomy_processed: [targetTaxonomy],
    files_changed: [],
    removed_admin_metaphors: [],
    removed_cliches: [],
    expansions: [],
    flagged_for_review: [],
    bigram_trigram_analysis: {
      top_20_bigrams: [],
      top_20_trigrams: [],
      template_stems: [],
    },
    cross_bundle_similarity: [],
    validation_errors: [],
  };

  const allItems: string[] = [];
  const taxonomyStems = new Map<string, Map<string, number>>();

  for (const file of files) {
    const filePath = path.join(bundlesDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const bundle = JSON.parse(raw);

    if (validateOnly) {
      // Pre-transformation validation (for --validate-only mode)
      const allBundleItems: string[] = [
        ...(bundle.meaning?.opportunities || []),
        ...(bundle.guidance?.do || []),
        ...(bundle.meaning?.frames?.map((f: any) => f.text) || []),
      ];

      for (const item of allBundleItems) {
        const adminMatches = checkAdminMetaphors(item);
        if (adminMatches.length > 0) {
          audit.validation_errors.push({
            file,
            rule: "admin_metaphor_ban",
            message: `Found admin metaphors: ${adminMatches.join(", ")}`,
          });
        }

        if (!checkAbstractGrounded(item)) {
          audit.validation_errors.push({
            file,
            rule: "abstract_without_grounding",
            message: `Abstract noun without grounded token: ${item}`,
          });
        }
      }
      continue;
    }

    // Transform first, then validate
    const { bundle: transformed, changes } = transformBundle(
      bundle,
      vocabMap,
      file
    );

    // Validate transformed bundle (only report post-transformation errors)
    const transformedItems: string[] = [
      ...(transformed.meaning?.opportunities || []),
      ...(transformed.guidance?.do || []),
      ...(transformed.meaning?.frames?.map((f: any) => f.text) || []),
    ];

    for (const item of transformedItems) {
      // Check admin metaphors
      const adminMatches = checkAdminMetaphors(item);
      if (adminMatches.length > 0) {
        audit.validation_errors.push({
          file,
          rule: "admin_metaphor_ban",
          message: `Found admin metaphors after transformation: ${adminMatches.join(", ")} - "${item}"`,
        });
      }

      // Check abstract grounding
      if (!checkAbstractGrounded(item)) {
        audit.validation_errors.push({
          file,
          rule: "abstract_without_grounding",
          message: `Abstract noun without grounded token after transformation: "${item}"`,
        });
      }
    }

    // Check repetition in transformed bundle
    const transformedFieldItems = [
      ...(transformed.meaning?.opportunities || []),
      ...(transformed.guidance?.do || []),
      ...(transformed.meaning?.frames?.map((f: any) => f.text) || []),
    ];
    const duplicates = checkRepetition(transformedFieldItems);
    if (duplicates.length > 0) {
      audit.validation_errors.push({
        file,
        rule: "repetition_within_bundle",
        message: `Duplicate stems after transformation: ${duplicates.join(", ")}`,
      });
    }

    // Check stem caps in transformed bundle
    const stemViolations = checkStemCaps(transformedFieldItems, transformedItems);
    if (stemViolations.violations.length > 0) {
      audit.validation_errors.push({
        file,
        rule: "cliche_stem_caps",
        message: `Stem cap violations after transformation: ${JSON.stringify(stemViolations.violations)}`,
      });
    }

    if (changes.length > 0) {
      audit.files_changed.push(file);

      for (const change of changes) {
        // Track removed admin metaphors
        for (let i = 0; i < change.original.length; i++) {
          const orig = change.original[i];
          const adminMatches = checkAdminMetaphors(orig);
          if (adminMatches.length > 0 && i < change.replacement.length) {
            audit.removed_admin_metaphors.push({
              file,
              field: change.field,
              original: orig,
              replacement: change.replacement[i],
            });
          }
        }

        // Track expansions
        if (change.replacement.length > change.original.length) {
          const newItems = change.replacement.slice(change.original.length);
          audit.expansions.push({
            file,
            field: change.field,
            before_count: change.original.length,
            after_count: change.replacement.length,
            new_items: newItems,
          });
        }
      }

      // Collect items for analysis
      allItems.push(...(transformed.meaning?.opportunities || []));
      allItems.push(...(transformed.guidance?.do || []));
      allItems.push(...(transformed.meaning?.frames?.map((f: any) => f.text) || []));

      // Track template stems per bundle
      const bundleStems = extractTemplateStems(
        [
          ...(transformed.meaning?.opportunities || []),
          ...(transformed.guidance?.do || []),
          ...(transformed.meaning?.frames?.map((f: any) => f.text) || []),
        ]
      );
      taxonomyStems.set(file, bundleStems);

      if (!dryRun) {
        // Backup
        const backupDir = path.join(bundlesDir, ".backup", Date.now().toString());
        fs.mkdirSync(backupDir, { recursive: true });
        fs.writeFileSync(
          path.join(backupDir, file),
          raw,
          "utf-8"
        );

        // Write transformed
        fs.writeFileSync(
          filePath,
          JSON.stringify(transformed, null, 2) + "\n",
          "utf-8"
        );
      }
    }
  }

  // Cross-bundle similarity analysis
  const stemFrequency = new Map<string, number>();
  for (const [file, stems] of taxonomyStems.entries()) {
    for (const [stem, count] of stems.entries()) {
      stemFrequency.set(stem, (stemFrequency.get(stem) || 0) + count);
    }
  }

  const topStems = Array.from(stemFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const flaggedStems = Array.from(stemFrequency.entries())
    .filter(([_, count]) => count > 5)
    .map(([stem]) => stem);

  audit.cross_bundle_similarity.push({
    taxonomy: targetTaxonomy,
    top_stems: topStems,
    flagged_stems: flaggedStems,
  });

  // Bigram/trigram analysis
  const { bigrams, trigrams } = analyzeBigramsTrigrams(allItems);
  audit.bigram_trigram_analysis.top_20_bigrams = Array.from(bigrams.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  audit.bigram_trigram_analysis.top_20_trigrams = Array.from(trigrams.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  audit.bigram_trigram_analysis.template_stems = topStems;

  // Write audit report
  const auditPath = path.resolve(
    __dirname,
    `../artifacts/canon-refactor-audit-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf-8");

  console.log(`\n=== Codemod Complete ===`);
  console.log(`Taxonomy: ${targetTaxonomy}`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Files changed: ${audit.files_changed.length}`);
  console.log(`Validation errors: ${audit.validation_errors.length}`);
  console.log(`Flagged stems: ${flaggedStems.length}`);
  console.log(`Audit report: ${auditPath}\n`);

  if (audit.validation_errors.length > 0) {
    console.log("Validation errors found:");
    for (const error of audit.validation_errors) {
      console.log(`  ${error.file}: ${error.rule} - ${error.message}`);
    }
    process.exit(1);
  }
}

main();
