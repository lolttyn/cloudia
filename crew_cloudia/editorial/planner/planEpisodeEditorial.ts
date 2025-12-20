import { EpisodeEditorialPlanSchema } from "./schema.js";
import {
  DailyInterpretation,
  EpisodeEditorialPlan,
  RecentEditorialMemory,
  SegmentEditorialPlan,
  SegmentKeyV1,
} from "./types.js";
import {
  ED_RULE_BACKGROUND_NEVER_HEADLINES,
  ED_RULE_INTRO_MAX_NEW_IDEAS_1,
  ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY,
  ED_RULE_ONE_CORE_THEME_PER_SEGMENT,
  ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK,
  ED_RULE_SEGMENT_IDEA_BUDGETS,
  ED_RULE_SPEAKABILITY_AVOID_NEVER,
  ED_RULE_SPEAKABILITY_MUST_SAY_WINS,
  SEGMENT_IDEA_BUDGETS,
  SEGMENT_INTENTS_V1,
  compareTagsDeterministically,
  isRecentTag,
} from "./rules.js";

type TagCandidate = DailyInterpretation["tags"][number] & { repeated: boolean };

const SEGMENT_ORDER: SegmentKeyV1[] = [
  "intro",
  "main_themes",
  "reflection",
  "closing",
];

const ensureRecordArray = (map: Record<string, string[]>, key: string) => {
  if (!map[key]) {
    map[key] = [];
  }
  return map[key];
};

const dedupeSorted = (items: string[]) =>
  Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));

const recordSuppressed = (
  suppressedByRule: Record<string, string[]>,
  ruleId: string,
  tag: string
) => {
  const bucket = ensureRecordArray(suppressedByRule, ruleId);
  if (!bucket.includes(tag)) {
    bucket.push(tag);
  }
};

const selectFirstCandidate = (
  pool: TagCandidate[],
  opts: {
    forbidBackground?: boolean;
    requirePrimary?: boolean;
    themePicked: boolean;
    suppressedByRule: Record<string, string[]>;
    suppressedTags: string[];
  }
) => {
  const rankedPool = [...pool].sort(compareTagsDeterministically);
  const filter = (candidate: TagCandidate) => {
    if (opts.requirePrimary && candidate.salience !== "primary") {
      return false;
    }
    if (opts.forbidBackground && candidate.salience === "background") {
      recordSuppressed(
        opts.suppressedByRule,
        ED_RULE_BACKGROUND_NEVER_HEADLINES,
        candidate.tag
      );
      opts.suppressedTags.push(candidate.tag);
      return false;
    }
    if (opts.themePicked && candidate.field === "theme") {
      recordSuppressed(
        opts.suppressedByRule,
        ED_RULE_ONE_CORE_THEME_PER_SEGMENT,
        candidate.tag
      );
      opts.suppressedTags.push(candidate.tag);
      return false;
    }
    return true;
  };

  return rankedPool.find(filter);
};

const fillRemaining = (
  pool: TagCandidate[],
  budget: number,
  opts: {
    themePicked: boolean;
    suppressedByRule: Record<string, string[]>;
    suppressedTags: string[];
  }
) => {
  const picks: TagCandidate[] = [];
  let themeUsed = opts.themePicked;
  const rankedPool = [...pool].sort(compareTagsDeterministically);

  for (const candidate of rankedPool) {
    if (picks.length >= budget) break;
    if (themeUsed && candidate.field === "theme") {
      recordSuppressed(
        opts.suppressedByRule,
        ED_RULE_ONE_CORE_THEME_PER_SEGMENT,
        candidate.tag
      );
      opts.suppressedTags.push(candidate.tag);
      continue;
    }
    picks.push(candidate);
    if (candidate.field === "theme") {
      themeUsed = true;
    }
  }

  return { picks, themeUsed };
};

export function planEpisodeEditorial(input: {
  interpretation: DailyInterpretation;
  memory: RecentEditorialMemory;
}): EpisodeEditorialPlan {
  const suppressedByRule: Record<string, string[]> = {};
  const selectedBySegment: Record<SegmentKeyV1, string[]> = {
    intro: [],
    main_themes: [],
    reflection: [],
    closing: [],
  };
  const lunation = input.interpretation.lunation;
  const lunationTagId = lunation?.signal_key;

  const continuityNotes = {
    callbacks: [] as string[],
    avoided_repetition: [] as string[],
  };

  const pool: TagCandidate[] = [];

  input.interpretation.tags.forEach((tag) => {
    if (tag.speakability === "avoid") {
      recordSuppressed(suppressedByRule, ED_RULE_SPEAKABILITY_AVOID_NEVER, tag.tag);
      return;
    }

    const recent = input.memory.recent_tags.find(
      (recentTag) =>
        recentTag.tag === tag.tag &&
        isRecentTag(input.interpretation.episode_date, recentTag.last_seen_date)
    );

    if (recent) {
      if (tag.speakability === "must_say") {
        if (!continuityNotes.callbacks.includes(tag.tag)) {
          continuityNotes.callbacks.push(tag.tag);
        }
        pool.push({ ...tag, repeated: true });
      } else {
        recordSuppressed(
          suppressedByRule,
          ED_RULE_RECENT_THEME_SUPPRESS_OR_CALLBACK,
          tag.tag
        );
        if (!continuityNotes.avoided_repetition.includes(tag.tag)) {
          continuityNotes.avoided_repetition.push(tag.tag);
        }
      }
      return;
    }

    pool.push({ ...tag, repeated: false });
  });

  pool.sort((a, b) => {
    if (lunationTagId) {
      const aL = a.tag === lunationTagId ? 1 : 0;
      const bL = b.tag === lunationTagId ? 1 : 0;
      if (aL !== bL) return aL ? -1 : 1;
    }
    return compareTagsDeterministically(a, b);
  });

  const segments: SegmentEditorialPlan[] = [];
  const lowConfidence = input.interpretation.confidence_level === "low";
  const isLunationCandidate = (candidate: TagCandidate) =>
    lunationTagId !== undefined && candidate.tag === lunationTagId;

  for (const segment_key of SEGMENT_ORDER) {
    const baseIntent = SEGMENT_INTENTS_V1[segment_key] || [];
    const intent = [...baseIntent];
    const suppressedTags: string[] = [];
    const rationale = new Set<string>([ED_RULE_SEGMENT_IDEA_BUDGETS]);
    let themePicked = false;
    const budget = lunation
      ? Math.min(SEGMENT_IDEA_BUDGETS[segment_key], 1)
      : SEGMENT_IDEA_BUDGETS[segment_key];

    if (segment_key === "intro") {
      rationale.add(ED_RULE_INTRO_MAX_NEW_IDEAS_1);
    }

    if (segment_key === "reflection" && lowConfidence) {
      intent.push("reflect_on_uncertainty");
      rationale.add(ED_RULE_LOW_CONF_REFLECTION_ACK_UNCERTAINTY);
    }

    const nonBackgroundExists = pool.some(
      (candidate) => candidate.salience !== "background"
    );

    if (pool.length === 0 || budget === 0) {
      segments.push({
        segment_key,
        intent,
        included_tags: [],
        suppressed_tags: suppressedTags,
        rationale: Array.from(rationale),
      });
      continue;
    }

    const picks: TagCandidate[] = [];

    const primeLunation = lunationTagId
      ? pool.find((candidate) => candidate.tag === lunationTagId && candidate.speakability !== "avoid")
      : undefined;

    if (segment_key === "intro") {
      const starter =
        primeLunation ??
        selectFirstCandidate(pool, {
          forbidBackground: nonBackgroundExists,
          requirePrimary: false,
          themePicked,
          suppressedByRule,
          suppressedTags,
        });
      if (starter) {
        picks.push(starter);
        if (starter.field === "theme") {
          themePicked = true;
        }
      }
    } else if (segment_key === "main_themes") {
      const primaryExists = pool.some(
        (candidate) => candidate.salience === "primary"
      );
      const firstCandidate =
        primeLunation ??
        selectFirstCandidate(pool, {
          forbidBackground: nonBackgroundExists,
          requirePrimary: primaryExists,
          themePicked,
          suppressedByRule,
          suppressedTags,
        });
      if (firstCandidate) {
        picks.push(firstCandidate);
        if (firstCandidate.field === "theme") {
          themePicked = true;
        }
      }

      if (primaryExists && firstCandidate && firstCandidate.salience === "background") {
        rationale.add(ED_RULE_BACKGROUND_NEVER_HEADLINES);
      }

      const remainingBudget = Math.max(budget - picks.length, 0);
      if (remainingBudget > 0) {
        const poolWithoutFirst = pool.filter(
          (candidate) => !picks.some((p) => p.tag === candidate.tag)
        );
        const { picks: rest, themeUsed } = fillRemaining(
          poolWithoutFirst,
          remainingBudget,
          {
            themePicked,
            suppressedByRule,
            suppressedTags,
          }
        );
        picks.push(...rest);
        themePicked = themeUsed;
      }
    } else {
      const { picks: chosen, themeUsed } = fillRemaining(pool, budget, {
        themePicked,
        suppressedByRule,
        suppressedTags,
      });
      picks.push(...chosen);
      themePicked = themeUsed;
    }

    if (picks.some((p) => p.speakability === "must_say")) {
      rationale.add(ED_RULE_SPEAKABILITY_MUST_SAY_WINS);
    }

    const includedTags = picks.map((p) => p.tag);
    selectedBySegment[segment_key] = includedTags;

    picks.forEach((pick) => {
      if (lunation && isLunationCandidate(pick)) {
        return;
      }
      const matchIndex = pool.findIndex((p) => p.tag === pick.tag);
      if (matchIndex >= 0) {
        pool.splice(matchIndex, 1);
      }
    });

    segments.push({
      segment_key,
      intent,
      included_tags: includedTags,
      suppressed_tags: dedupeSorted(suppressedTags),
      rationale: Array.from(rationale),
    });
  }

  const plan: EpisodeEditorialPlan = {
    episode_date: input.interpretation.episode_date,
    segments,
    continuity_notes: {
      callbacks: dedupeSorted(continuityNotes.callbacks),
      avoided_repetition: dedupeSorted(continuityNotes.avoided_repetition),
    },
    debug: {
      selected_by_segment: selectedBySegment,
      suppressed_by_rule: Object.fromEntries(
        Object.entries(suppressedByRule).map(([rule, tags]) => [
          rule,
          dedupeSorted(tags),
        ])
      ),
    },
  };

  EpisodeEditorialPlanSchema.parse(plan);
  return plan;
}

