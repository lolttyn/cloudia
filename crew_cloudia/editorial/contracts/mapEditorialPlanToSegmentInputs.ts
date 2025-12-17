import {
  ConfidenceLevel,
  EpisodeEditorialPlan,
  SegmentEditorialPlan,
  SegmentKeyV1,
} from "../planner/types.js";
import { SEGMENT_IDEA_BUDGETS } from "../planner/rules.js";
import { SegmentPromptInput } from "./segmentPromptInput.js";

const SEGMENT_ORDER: SegmentKeyV1[] = ["intro", "main_themes", "reflection", "closing"];

const BAN_REPETITION_POLICY: Record<SegmentKeyV1, boolean> = {
  intro: true,
  main_themes: true,
  reflection: false,
  closing: true,
};

const MUST_ACKNOWLEDGE_UNCERTAINTY_POLICY = (
  segmentKey: SegmentKeyV1,
  confidence: ConfidenceLevel
) => {
  if (segmentKey === "reflection") {
    return confidence === "low";
  }
  if (segmentKey === "main_themes") {
    return confidence === "low";
  }
  return false;
};

const assertNonEmptyIntent = (segment: SegmentEditorialPlan) => {
  if (segment.intent.length === 0) {
    throw new Error(`Segment ${segment.segment_key} has empty intent`);
  }
};

const getConfidence = (plan: EpisodeEditorialPlan): ConfidenceLevel => {
  const candidate = (plan as EpisodeEditorialPlan & { confidence_level?: ConfidenceLevel })
    .confidence_level;
  if (!candidate) {
    throw new Error("EpisodeEditorialPlan missing confidence_level");
  }
  return candidate;
};

const buildConstraints = (
  segmentKey: SegmentKeyV1,
  confidence: ConfidenceLevel
): SegmentPromptInput["constraints"] => {
  const maxIdeas = SEGMENT_IDEA_BUDGETS[segmentKey];
  if (typeof maxIdeas !== "number" || maxIdeas < 1) {
    throw new Error(`Invalid max_ideas for ${segmentKey}`);
  }

  return {
    max_ideas: maxIdeas,
    must_acknowledge_uncertainty: MUST_ACKNOWLEDGE_UNCERTAINTY_POLICY(
      segmentKey,
      confidence
    ),
    ban_repetition: BAN_REPETITION_POLICY[segmentKey],
  };
};

export function mapEditorialPlanToSegmentInputs(
  plan: EpisodeEditorialPlan
): SegmentPromptInput[] {
  const confidenceLevel = getConfidence(plan);

  const segmentLookup = new Map<SegmentKeyV1, SegmentEditorialPlan>();
  for (const segment of plan.segments) {
    if (!SEGMENT_ORDER.includes(segment.segment_key)) {
      throw new Error(`Unknown segment ${segment.segment_key}`);
    }
    if (segmentLookup.has(segment.segment_key)) {
      throw new Error(`Duplicate segment ${segment.segment_key}`);
    }
    segmentLookup.set(segment.segment_key, segment);
  }

  if (segmentLookup.size !== SEGMENT_ORDER.length) {
    throw new Error("Missing segments for prompt input mapping");
  }

  return SEGMENT_ORDER.map((segmentKey) => {
    const segment = segmentLookup.get(segmentKey);
    if (!segment) {
      throw new Error(`Segment ${segmentKey} not found`);
    }

    assertNonEmptyIntent(segment);

    const constraints = buildConstraints(segmentKey, confidenceLevel);

    return {
      episode_date: plan.episode_date,
      segment_key: segmentKey,
      intent: [...segment.intent],
      included_tags: [...segment.included_tags],
      suppressed_tags: [...segment.suppressed_tags],
      confidence_level: confidenceLevel,
      constraints,
    };
  });
}


