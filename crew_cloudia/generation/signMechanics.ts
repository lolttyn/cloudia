/**
 * One-line teaching blurbs (element, ruler, casual explanation) per zodiac sign.
 * Injected directly into prompts so the model has the teaching material in-context
 * and can't skip the "teach don't assert" moment.
 */
export const SIGN_MECHANICS: Record<string, string> = {
  aries:
    "Aries is a fire sign ruled by Mars — think raw initiative and the impulse to move first, ask questions later.",
  taurus:
    "Taurus is an earth sign ruled by Venus — it's about sensory comfort, steady pace, and protecting what you value.",
  gemini:
    "Gemini is an air sign ruled by Mercury — curiosity, quick shifts, and the urge to connect the dots.",
  cancer:
    "Cancer is a water sign ruled by the Moon — mood, what needs tending, and the pull toward home or comfort.",
  leo:
    "Leo is a fire sign ruled by the Sun — visibility, heart-forward energy, and the need to be seen.",
  virgo:
    "Virgo is an earth sign ruled by Mercury — refinement, useful detail, and the itch to make things better.",
  libra:
    "Libra is an air sign ruled by Venus — balance, relationship, and weighing the options.",
  scorpio:
    "Scorpio is a water sign ruled by Pluto — depth, what's under the surface, and the urge to get to the truth.",
  sagittarius:
    "Sagittarius is a fire sign ruled by Jupiter — think big-picture optimism and restless curiosity.",
  capricorn:
    "Capricorn is an earth sign ruled by Saturn — structure, discipline, and the long game.",
  aquarius:
    "Aquarius is an air sign ruled by Uranus — detachment, sudden shifts, and the bigger picture.",
  pisces:
    "Pisces is a water sign ruled by Neptune — softening, imagination, and the edges between self and other.",
};

const SIGN_NAMES = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

function extractSignFromLabel(label: string): string | null {
  const lower = label.toLowerCase();
  const match = lower.match(
    /\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/
  );
  return match ? match[1] : null;
}

/** Get the teaching blurb for a sign (key lowercase). */
export function getSignMechanicsBlurb(sign: string): string | null {
  const key = sign.toLowerCase();
  return SIGN_MECHANICS[key] ?? null;
}

export type SkyAnchorLike = { type?: string; label?: string };

/**
 * From frame.sky_anchors, find Moon and Sun anchors and return their mechanics blurbs
 * plus a ready-to-inject prompt block. Used by intro and main_themes.
 */
export function getMoonAndSunMechanicsBlock(sky_anchors: SkyAnchorLike[]): string {
  let moonLabel: string | null = null;
  let sunLabel: string | null = null;
  for (const a of sky_anchors ?? []) {
    const label = (a.label ?? "").trim();
    if (!label) continue;
    const lower = label.toLowerCase();
    if (lower.startsWith("moon in ") || a.type === "moon_sign") {
      moonLabel = label;
    } else if (lower.startsWith("sun in ") || a.type === "sun_sign") {
      sunLabel = label;
    }
  }
  const parts: string[] = [];
  if (moonLabel) {
    const sign = extractSignFromLabel(moonLabel);
    const blurb = sign ? getSignMechanicsBlurb(sign) : null;
    if (blurb) {
      parts.push(`Today's Moon: ${moonLabel}. (${blurb}) Use this to teach the listener in passing.`);
    }
  }
  if (sunLabel) {
    const sign = extractSignFromLabel(sunLabel);
    const blurb = sign ? getSignMechanicsBlurb(sign) : null;
    if (blurb) {
      parts.push(`Today's Sun: ${sunLabel}. (${blurb}) You may reference this for collective energy.`);
    }
  }
  if (parts.length === 0) return "";
  return [
    parts.join("\n"),
    "You MUST include one brief teaching moment per episode that explains the element or ruler of the Moon sign. This is a non-negotiable part of Cloudia's character — she's the friend who makes astrology make sense.",
  ].join("\n\n");
}
