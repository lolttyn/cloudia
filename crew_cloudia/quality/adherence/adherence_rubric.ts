import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";
import { AdherenceInput, AdherenceResult, ScoreAdjustment } from "./types.js";
import { normalizeText } from "./utils/textNormalization.js";
import { checkClosingRepetition } from "./utils/repetitionCheck.js";

export const HARD_BANNED_PHRASES = [
  "primary meanings",
  "relevance",
  "concrete example",
  "confidence alignment",
  "interpretive frame",
  "temporal phase",
  "intensity modifier",
  "confidence level",
  "meaning over minutiae",
  "dominant contrast",
  "contrast axis",
  "focus is firmly on",
];

const SYSTEM_LEVEL_EXPLANATION_PATTERNS = [
  "in astrology",
  "astrologically speaking",
  "represents the idea of",
  "dominant contrast",
  "contrast axis",
  "meaning over minutiae",
  "focus is firmly on",
];

const ABSTRACT_NOUNS = ["meaning", "values", "beliefs", "themes", "concepts"];

const LUNATION_FEELING_MARKERS = [
  "feels different",
  "shift",
  "reset",
  "clean slate",
  "letting go",
  "opening",
  "closing",
  "done with",
];

const HUMAN_REFERENTS = [
  // Body
  "breath",
  "shoulders",
  "jaw",
  "stomach",
  "sleep",
  "appetite",
  "pulse",
  "tension",
  // Home
  "sink",
  "dishes",
  "laundry",
  "door",
  "light",
  "clutter",
  "repairs",
  // Street/Environment
  "crosswalk",
  "bus",
  "line",
  "traffic",
  "cold air",
  "sunlight",
  // Interpersonal
  "text",
  "phone",
  "friend",
  "partner",
  "stranger",
  "conversation",
  "apology",
  "boundary",
  // Objects
  "keys",
  "shoes",
  "bag",
  "receipt",
  "spilled",
  "dropped",
  "cracked",
  // Time/Moment
  "waiting",
  "late",
  "early",
  "pause",
  "linger",
  // Other lived moments
  "coffee",
  "clothes",
  "food",
  "weather",
  "commute",
  "noise",
  "silence",
];

const SOCIAL_SCENARIOS = [
  "overshare",
  "avoid",
  "conversation",
  "boundary",
  "space",
  "seen",
];

const EMBODIED_SIGNALS = [
  "gut",
  "chest",
  "body",
  "nervous system",
  "tension",
  "relief",
  "restless",
];

const AFFORDANCE_MARKERS = [
  "you dont have to",
  "not today",
  "let this sit",
  "this isnt urgent",
  "take the space",
  "wait",
  "stop",
  "dont",
];

const BODY_OR_EMOTION_MARKERS = [
  "you ",
  " your",
  "body",
  "feel",
  "feels",
  "feeling",
  "felt",
  "emotion",
  "emotional",
  "gut",
  "chest",
  "nervous system",
  "heart",
  "hands",
  "skin",
  "breath",
  "breathe",
  "breathing",
  "touch",
  "tear",
  "cry",
  "laugh",
  "stomach",
  "conversation",
  "text",
  "call",
  "voice",
];

const CHRONOLOGY_MARKERS = ["entered", "after", "moves into", "moving into", "moved into", "entering"];

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

const containsAny = (text: string, markers: string[]): boolean =>
  markers.some((marker) => text.includes(marker));

const addScore = (
  list: ScoreAdjustment[],
  adjustment: ScoreAdjustment
): void => {
  list.push(adjustment);
};

function enforceHardBans(normalized: string, blocking: Set<string>): void {
  // Phase D: Only block EXACT banned phrases, not semantic paraphrases
  // Use exact phrase matching to avoid false positives from similar concepts
  for (const phrase of HARD_BANNED_PHRASES) {
    const normalizedPhrase = normalizeText(phrase);
    
    // Check for exact phrase match (all words in sequence)
    // This prevents matching partial phrases or paraphrases
    // Use word boundaries to ensure we match the complete phrase, not substrings
    const words = normalizedPhrase.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      // Multi-word phrase: require exact sequence with word boundaries
      // Escape special regex characters in each word
      const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const phrasePattern = `\\b${escapedWords.join("\\s+")}\\b`;
      const regex = new RegExp(phrasePattern, "i");
      if (regex.test(normalized)) {
        blocking.add(`HARD_BANNED_LANGUAGE:${normalizedPhrase}`);
      }
    } else {
      // Single word: use word boundary to avoid partial matches
      const escapedWord = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
      if (regex.test(normalized)) {
        blocking.add(`HARD_BANNED_LANGUAGE:${normalizedPhrase}`);
      }
    }
  }
}

function enforceSystemLevel(
  sentences: string[],
  blocking: Set<string>
): void {
  sentences.forEach((sentence, idx) => {
    const lower = sentence.toLowerCase().trim();
    
    // Check for system-level explanation patterns
    const hasSystemPattern = SYSTEM_LEVEL_EXPLANATION_PATTERNS.some((p) => lower.includes(p));
    
    // Additional explicit check: "astrologically speaking/in astrology" + "represents/means/symbolizes"
    // This pattern is always system-level explanation
    const astrologyIntroPattern = /\b(astrologically speaking|in astrology|astrology says)\b/i;
    const representsPattern = /\b(represents|means|symbolizes|stands for)\b/i;
    const hasAstrologyIntro = astrologyIntroPattern.test(lower);
    const hasRepresents = representsPattern.test(lower);
    
    // If it has both astrology intro AND represents/means pattern, it's definitely system-level
    if (hasAstrologyIntro && hasRepresents) {
      blocking.add("SYSTEM_LEVEL_EXPLANATION");
      return;
    }
    
    // Otherwise, check standard patterns
    if (!hasSystemPattern) return;

    // Check if there's lived experience to exempt it
    const neighbor = [sentence, sentences[idx + 1] ?? ""].join(" ").toLowerCase().trim();
    const hasLived = BODY_OR_EMOTION_MARKERS.some((marker) => neighbor.includes(marker));
    if (!hasLived) {
      blocking.add("SYSTEM_LEVEL_EXPLANATION");
    }
  });
}

function enforceAbstractWithoutTranslation(
  paragraphs: string[],
  blocking: Set<string>
): void {
  for (const paragraph of paragraphs) {
    const lower = paragraph.toLowerCase();
    const hasAbstract = ABSTRACT_NOUNS.some((n) => lower.includes(n));
    if (!hasAbstract) continue;

    const hasHumanReferent = containsAny(lower, [
      ...HUMAN_REFERENTS,
      ...SOCIAL_SCENARIOS,
      ...EMBODIED_SIGNALS,
      "you ",
      " your",
      "people",
      "someone",
    ]);
    if (!hasHumanReferent) {
      blocking.add("ABSTRACT_WITHOUT_TRANSLATION");
    }
  }
}

function enforceLunationFrontLoad(
  script: string,
  segment_key: string,
  frame: InterpretiveFrame,
  blocking: Set<string>
): void {
  if (!frame.lunation) return;
  if (!["intro", "main_themes", "closing"].includes(segment_key)) return;

  const lower = script.toLowerCase();
  const lunationKeywords = ["new moon", "full moon", "moon", "lunation"];
  
  // Phase D: Semantic check - lunation must feel special, not necessarily be first
  const sentences = splitSentences(script);
  
  // For closings: softer rule - emotional settling/integration counts
  if (segment_key === "closing") {
    const firstSentence = sentences[0]?.toLowerCase() || "";
    const emotionalSettlingMarkers = [
      "settles", "settling", "softens", "softening", "winds down", "winding down",
      "integrates", "integrating", "releases", "releasing", "eases", "easing",
      "quiet", "quietly", "calm", "calms", "still", "stillness"
    ];
    
    // Check if first sentence has emotional settling OR lunation feeling markers
    const hasSettling = emotionalSettlingMarkers.some((m) => firstSentence.includes(m));
    const hasFeelingMarker = LUNATION_FEELING_MARKERS.some((m) => firstSentence.includes(m));
    const hasLunationMention = lunationKeywords.some((k) => firstSentence.includes(k));
    
    // For closing: emotional settling OR lunation feeling in first sentence satisfies the rule
    if (hasSettling || hasFeelingMarker || hasLunationMention) {
      return; // Pass
    }
    
    // If none of the above, check if lunation is mentioned anywhere with feeling
    const hasLunationAnywhere = lunationKeywords.some((k) => lower.includes(k));
    if (hasLunationAnywhere) {
      const firstMentionSentence = sentences.find((s) =>
        lunationKeywords.some((k) => s.toLowerCase().includes(k))
      );
      if (firstMentionSentence) {
        const lowerSentence = firstMentionSentence.toLowerCase();
        const hasFeelingInMention = LUNATION_FEELING_MARKERS.some((m) => lowerSentence.includes(m));
        if (hasFeelingInMention) {
          return; // Pass - lunation mentioned with feeling
        }
      }
    }
    
    // No settling, no feeling markers, no lunation with feeling = fail
    blocking.add("LUNATION_NOT_FRONT_LOADED");
    return;
  }
  
  // For intro/main_themes: only require front-loading if lunation is actually mentioned
  // If the script doesn't mention moon/lunation at all, don't require front-loading
  const hasLunationMentionAnywhere = lunationKeywords.some((k) => lower.includes(k));
  if (!hasLunationMentionAnywhere) {
    return; // No lunation mention = no requirement to front-load
  }
  
  // Check first ~40% for feeling markers or lunation mention
  const firstFortyPercent = Math.ceil(sentences.length * 0.4);
  const earlySentences = sentences.slice(0, firstFortyPercent).join(" ").toLowerCase();
  
  const hasFeelingMarker = LUNATION_FEELING_MARKERS.some((m) =>
    earlySentences.includes(m)
  );
  
  const hasLunationMention = lunationKeywords.some((k) => earlySentences.includes(k));
  
  // If lunation is mentioned early, check that feeling precedes chronology
  if (hasLunationMention) {
    const firstMentionSentence = sentences.find((s) =>
      lunationKeywords.some((k) => s.toLowerCase().includes(k))
    );
    
    if (firstMentionSentence) {
      const lowerSentence = firstMentionSentence.toLowerCase();
      const chronologyIndex = CHRONOLOGY_MARKERS.map((m) => lowerSentence.indexOf(m))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0] ?? -1;
      const feelingIndex = LUNATION_FEELING_MARKERS.map((m) => lowerSentence.indexOf(m))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)[0] ?? -1;

      const chronologyPrecedesFeeling =
        chronologyIndex >= 0 && (feelingIndex === -1 || chronologyIndex < feelingIndex);

      if (chronologyPrecedesFeeling && !hasFeelingMarker) {
        blocking.add("LUNATION_NOT_FRONT_LOADED");
        return;
      }
    }
  }
  
  // If no feeling markers in early portion AND no lunation mention in early portion, it's not front-loaded
  if (!hasFeelingMarker && !hasLunationMention) {
    blocking.add("LUNATION_NOT_FRONT_LOADED");
  }
}

function enforceRelationalTranslation(
  lower: string,
  segment_key: string,
  blocking: Set<string>
): void {
  if (segment_key !== "main_themes") return;
  const hasHuman = containsAny(lower, HUMAN_REFERENTS);
  const hasSocial = containsAny(lower, SOCIAL_SCENARIOS);
  const hasEmbodied = containsAny(lower, EMBODIED_SIGNALS);
  if (!hasHuman && !hasSocial && !hasEmbodied) {
    blocking.add("NO_RELATIONAL_TRANSLATION");
  }
}

function enforceBehavioralAffordance(
  lower: string,
  segment_key: string,
  blocking: Set<string>
): void {
  if (!["main_themes", "closing"].includes(segment_key)) return;
  
  // Phase D: For closing, recognize soft permission patterns as valid affordances
  // Soft permissions satisfy the requirement without triggering advice/prediction blocks
  if (segment_key === "closing") {
    const SOFT_PERMISSION_PATTERNS = [
      /you might let/i,
      /you might notice/i,
      /it'?s okay to/i,
      /it is okay to/i,
      /you don'?t have to/i,
      /there'?s room to/i,
      /nothing needs to/i,
      /you can leave/i,
      /you can let/i,
      /you can notice/i,
      /you can pause/i,
      /you can rest/i,
      /you can stop/i,
      /it'?s fine to/i,
      /it is fine to/i,
      /not today/i,
      /this isn'?t urgent/i,
      /take the space/i,
    ];
    
    const hasSoftPermission = SOFT_PERMISSION_PATTERNS.some((re) => re.test(lower));
    const hasStandardAffordance = containsAny(lower, AFFORDANCE_MARKERS);
    
    if (hasSoftPermission || hasStandardAffordance) {
      return; // Either soft permission or standard affordance satisfies requirement
    }
  } else {
    // For main_themes: use standard affordance markers
    // Check if any affordance marker appears in the text
    const hasAffordance = containsAny(lower, AFFORDANCE_MARKERS);
    if (!hasAffordance) {
      blocking.add("NO_BEHAVIORAL_AFFORDANCE");
    }
    return;
  }
  
  // Closing: no affordance found
  blocking.add("NO_BEHAVIORAL_AFFORDANCE");
}

function enforceAdminMetaphorBan(
  text: string,
  lower: string,
  segment_key: string,
  episode_date: string | undefined,
  blocking: Set<string>
): void {
  // Apply to intro and main_themes (optionally closing)
  if (!["intro", "main_themes"].includes(segment_key)) return;

  // Admin metaphor trope patterns (case-insensitive via lower)
  const adminTropePatterns = [
    /\bcalendar (invite|invites|details)\b/,
    /\binbox triage\b|\btriage (your|the) inbox\b/,
    /\bre-?reading (an|the) (email|message)\b|\bre-?reading the same (email|message)\b/,
    /\bdouble-?checking (a|the) (calendar|invite|email|message|details)\b/,
    /\b(one more )?(tiny|small) correction\b/,
    /\b(admin|life admin|paperwork)\b/,
    /\bmeetings?\b/, // Added: meetings in admin context
  ];

  for (const pattern of adminTropePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const matchLower = match[0].toLowerCase();
      const idx = lower.indexOf(matchLower);
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + match[0].length + 60);

      console.log("[admin-ban-hit]", {
        episode_date: episode_date || "unknown",
        segment_key,
        pattern: pattern.source,
        match: match[0],
        context: text.slice(start, end),
      });

      blocking.add("HARD_BANNED_TROPES_ADMIN_METAPHORS");
      return; // Only need one match to block
    }
  }
}

function enforceMainThemesMoonTransitBan(
  text: string,
  lower: string,
  segment_key: string,
  episode_date: string | undefined,
  blocking: Set<string>
): void {
  if (segment_key !== "main_themes") return;

  const zodiacSigns = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
  ];
  const zodiacAbbr = [
    "ari", "tau", "gem", "can", "leo", "vir",
    "lib", "sco", "sag", "cap", "aqu", "pis"
  ];
  const signPattern = [...zodiacSigns, ...zodiacAbbr].join("|");

  const moonTransitPatterns: RegExp[] = [
    new RegExp(`\\bmoon\\b[^.!?\\n]{0,60}\\b(is in|isn't in|isnt in|in|\\'s in|’s in)\\s+(${signPattern})\\b`, "i"),
    /\bmoon\b[^.!?\n]{0,60}\bin\s+(this|that)\s+sign\b/i,
    /\bmoon\b[^.!?\n]{0,60}\b(entered|enters|entering|moving into|moves into|moved into|shifted|slipped)\b/i,
    new RegExp(`\\bmoon\\b[^.!?\\n]{0,80}\\bfrom\\s+(${signPattern})\\s+to\\s+(${signPattern})\\b`, "i"),
    new RegExp(`\\blunar\\b[^.!?\\n]{0,60}\\b(entered|enters|entering|moving into|moves into|moved into|shifted|slipped)\\b`, "i"),
    new RegExp(`\\blunar\\b[^.!?\\n]{0,60}\\b(in|into)\\s+(${signPattern})\\b`, "i"),
  ];

  for (const pattern of moonTransitPatterns) {
    const match = text.match(pattern);
    if (match) {
      const idx = text.toLowerCase().indexOf(match[0].toLowerCase());
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + match[0].length + 60);

      console.log("[main-themes-moon-transit-ban]", {
        episode_date: episode_date || "unknown",
        segment_key,
        match: match[0],
        pattern: pattern.source,
        context: text.slice(start, end),
      });

      blocking.add("MAIN_THEMES_MOON_TRANSIT_BAN");
      return;
    }
  }
}

function enforceMainThemesLunationLabelSpecificity(
  script: string,
  segment_key: string,
  warnings: Set<string>,
  score_breakdown: ScoreAdjustment[]
): void {
  if (segment_key !== "main_themes") return;
  const firstSentence = splitSentences(script)[0]?.toLowerCase() ?? "";
  if (firstSentence.includes("lunar phase")) {
    warnings.add("MAIN_THEMES_LUNATION_LABEL_GENERIC");
    addScore(score_breakdown, {
      code: "MAIN_THEMES_LUNATION_LABEL_GENERIC",
      delta: -0.5,
      reason: "Generic lunation label ('Lunar phase') used in first sentence.",
    });
  }
}

function enforceClosingParentheticalAstroBan(
  script: string,
  segment_key: string,
  blocking: Set<string>
): void {
  if (segment_key !== "closing") return;
  const astroInParens =
    /\(([^)]*(conjunction|opposition|trine|sextile|square|orb|sun-moon)[^)]*)\)/i;
  if (astroInParens.test(script)) {
    blocking.add("CLOSING_PARENTHETICAL_ASTRO");
  }
}

function enforceClosingOpenerDiversity(
  script: string,
  segment_key: string,
  previous_closings: string[] | undefined,
  warnings: Set<string>,
  blocking: Set<string>,
  score_breakdown: ScoreAdjustment[]
): void {
  if (segment_key !== "closing") return;
  const openerPattern = /^as the day winds down\b/i;
  const startsWithPattern = openerPattern.test(script.trim());
  if (!startsWithPattern) return;

  warnings.add("CLOSING_OPENER_REPETITION");
  addScore(score_breakdown, {
    code: "CLOSING_OPENER_REPETITION",
    delta: -0.5,
    reason: "Closing opener repeats a common template.",
  });

  if (previous_closings && previous_closings.length > 0) {
    const priorMatches = previous_closings.filter((c) =>
      openerPattern.test(c.trim())
    ).length;
    if (priorMatches >= 2) {
      blocking.add("CLOSING_OPENER_REPETITION");
    }
  }
}
function enforceSkyAnchorConsistency(
  text: string,
  lower: string,
  segment_key: string,
  interpretive_frame: InterpretiveFrame | undefined,
  episode_date: string | undefined,
  blocking: Set<string>
): void {
  // Only apply to main_themes (where sky anchor consistency matters most)
  if (segment_key !== "main_themes") return;
  if (!interpretive_frame?.sky_anchors || interpretive_frame.sky_anchors.length === 0) return;

  // Extract allowed sign names from sky_anchors
  const allowedSigns = new Set<string>();
  for (const anchor of interpretive_frame.sky_anchors) {
    const signMatch = anchor.label.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
    if (signMatch) {
      allowedSigns.add(signMatch[1].toLowerCase());
    }
  }

  // If no signs found in anchors, skip check (unlikely but safe)
  if (allowedSigns.size === 0) return;

  // Check for mentions of zodiac signs in the script
  const zodiacSigns = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
  ];

  for (const sign of zodiacSigns) {
    // Check if sign is mentioned in the script
    const signRegex = new RegExp(`\\b${sign}\\b`, "i");
    if (signRegex.test(lower)) {
      // If sign is mentioned but not in allowed list, block
      if (!allowedSigns.has(sign.toLowerCase())) {
        const signIndex = lower.indexOf(sign.toLowerCase());
        const start = Math.max(0, signIndex - 60);
        const end = Math.min(text.length, signIndex + sign.length + 60);

        console.log("[sky-anchor-consistency-hit]", {
          episode_date: episode_date || "unknown",
          segment_key,
          forbidden_sign: sign,
          allowed_signs: Array.from(allowedSigns),
          context: text.slice(start, end),
        });

        blocking.add("SKY_ANCHOR_CONSISTENCY");
        return; // Only need one violation to block
      }
    }
  }

  // Also check for contradictory ingress claims (e.g., "moved into Capricorn" when Capricorn isn't anchored)
  const ingressPatterns = [
    /\bmoved into\s+(\w+)/i,
    /\bmoving into\s+(\w+)/i,
    /\bentered\s+(\w+)/i,
    /\bentering\s+(\w+)/i,
    /\bshifted (?:out of|into)\s+(\w+)/i,
    /\bslipped (?:out of|into)\s+(\w+)/i,
  ];

  for (const pattern of ingressPatterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const mentionedSign = match[1].toLowerCase();
      // Check if the mentioned sign is a valid zodiac sign
      if (zodiacSigns.includes(mentionedSign)) {
        // If it's a sign but not in allowed list, block
        if (!allowedSigns.has(mentionedSign)) {
          const matchIndex = lower.indexOf(match[0]);
          const start = Math.max(0, matchIndex - 60);
          const end = Math.min(text.length, matchIndex + match[0].length + 60);

          console.log("[sky-anchor-consistency-hit]", {
            episode_date: episode_date || "unknown",
            segment_key,
            forbidden_ingress: match[0],
            mentioned_sign: mentionedSign,
            allowed_signs: Array.from(allowedSigns),
            context: text.slice(start, end),
          });

          blocking.add("SKY_ANCHOR_CONSISTENCY");
          return;
        }
      }
    }
  }
}

function applyAuthorialCompression(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const clauseMarkers = ["which means", "this is because"];
    const occurrences = clauseMarkers.reduce(
      (count, marker) => count + (lower.split(marker).length - 1),
      0
    );
    if (occurrences > 1) {
      addScore(adjustments, {
        code: "AUTHORIAL_COMPRESSION_PENALTY",
        delta: -1,
        reason: "Stacked explanatory clauses reduce compression.",
      });
    } else {
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;
      if (wordCount > 0 && wordCount <= 14 && !lower.includes("because")) {
        addScore(adjustments, {
          code: "AUTHORIAL_COMPRESSION_REWARD",
          delta: 0.5,
          reason: "Concise assertion/metaphor without trailing explanation.",
        });
      }
    }
  }
  return adjustments;
}

function applyPermissionWithTeeth(scriptLower: string): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  const imperativePatterns = [
    /\byou can\b/,
    /\bsay no\b/,
    /\bskip\b/,
    /\bdrop it\b/,
    /\bstep back\b/,
    /\btake the space\b/,
  ];
  const paddingMarkers = ["gentle", "just a reminder", "just wanted to", "maybe", "perhaps"];

  if (imperativePatterns.some((re) => re.test(scriptLower))) {
    addScore(adjustments, {
      code: "PERMISSION_WITH_TEETH_REWARD",
      delta: 0.5,
      reason: "Direct imperative/permission language present.",
    });
  }

  if (paddingMarkers.some((p) => scriptLower.includes(p))) {
    addScore(adjustments, {
      code: "PERMISSION_WITH_TEETH_PENALTY",
      delta: -0.5,
      reason: "Padding language softens directives.",
    });
  }

  return adjustments;
}

function applyConversationalAuthority(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  const hedges = ["you may find", "it might be helpful"];
  const allText = sentences.join(" ").toLowerCase();

  if (hedges.some((h) => allText.includes(h))) {
    addScore(adjustments, {
      code: "CONVERSATIONAL_AUTHORITY_PENALTY",
      delta: -1,
      reason: "Hedging language weakens authority.",
    });
  }

  const youCount = (allText.match(/\byou\b/g) || []).length;
  const shortDeclaratives = sentences.filter(
    (s) => s.split(/\s+/).filter(Boolean).length <= 10
  ).length;
  if (youCount >= 2 && shortDeclaratives > 0) {
    addScore(adjustments, {
      code: "CONVERSATIONAL_AUTHORITY_REWARD",
      delta: 0.5,
      reason: "Second-person declaratives provide authority.",
    });
  }

  return adjustments;
}

function applyEnergyEmbodiment(sentences: string[]): ScoreAdjustment[] {
  const adjustments: ScoreAdjustment[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!lower.includes("energy")) continue;

    const hasSocialOrBody = containsAny(lower, [
      ...HUMAN_REFERENTS,
      ...EMBODIED_SIGNALS,
      "people",
      "you",
    ]);

    if (hasSocialOrBody) {
      addScore(adjustments, {
        code: "ENERGY_EMBODIMENT_REWARD",
        delta: 0.5,
        reason: "Energy is grounded in social/body context.",
      });
    } else {
      addScore(adjustments, {
        code: "ENERGY_EMBODIMENT_PENALTY",
        delta: -0.5,
        reason: "Energy is referenced abstractly without embodiment.",
      });
    }
  }
  return adjustments;
}

export function evaluateAdherenceRubric(input: AdherenceInput): AdherenceResult {
  const blocking = new Set<string>();
  const warnings = new Set<string>();
  const score_breakdown: ScoreAdjustment[] = [];

  const script = input.script ?? "";
  const normalized = normalizeText(script);
  const sentences = splitSentences(script);
  const paragraphs = script.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lower = script.toLowerCase().replace(/'/g, "'");

  // Extract episode_date from input (preferred) or interpretive_frame (fallback)
  const episode_date = input.episode_date || input.interpretive_frame?.episode_date;

  enforceHardBans(normalized, blocking);
  enforceSystemLevel(sentences, blocking);
  enforceAbstractWithoutTranslation(paragraphs, blocking);
  enforceLunationFrontLoad(script, input.segment_key, input.interpretive_frame, blocking);
  enforceRelationalTranslation(lower, input.segment_key, blocking);
  enforceBehavioralAffordance(lower, input.segment_key, blocking);
  enforceAdminMetaphorBan(script, lower, input.segment_key, episode_date, blocking);
  enforceMainThemesMoonTransitBan(script, lower, input.segment_key, episode_date, blocking);
  enforceClosingParentheticalAstroBan(script, input.segment_key, blocking);
  enforceClosingOpenerDiversity(
    script,
    input.segment_key,
    input.previous_closings,
    warnings,
    blocking,
    score_breakdown
  );
  enforceMainThemesLunationLabelSpecificity(
    script,
    input.segment_key,
    warnings,
    score_breakdown
  );
  enforceSkyAnchorConsistency(script, lower, input.segment_key, input.interpretive_frame, episode_date, blocking);

  const repetition = input.segment_key === "closing" && input.previous_closings?.length
    ? checkClosingRepetition(script, input.previous_closings)
    : undefined;

  if (repetition?.exactMatch) {
    blocking.add("REPEATED_CLOSING_TEMPLATE");
  } else if (repetition && repetition.highestOverlap >= 0.7) {
    addScore(score_breakdown, {
      code: "REPEATED_CLOSING_TEMPLATE",
      delta: -1,
      reason: `High overlap (${Math.round(repetition.highestOverlap * 100)}%) with prior closing.`,
    });
    warnings.add("REPEATED_CLOSING_TEMPLATE");
  }

  [
    ...applyAuthorialCompression(sentences),
    ...applyPermissionWithTeeth(lower),
    ...applyConversationalAuthority(sentences),
    ...applyEnergyEmbodiment(sentences),
  ].forEach((adj) => score_breakdown.push(adj));

  const score = score_breakdown.reduce((sum, adj) => sum + adj.delta, 0);

  return {
    blocking_reasons: Array.from(blocking),
    warnings: Array.from(warnings),
    score,
    score_breakdown,
  };
}

