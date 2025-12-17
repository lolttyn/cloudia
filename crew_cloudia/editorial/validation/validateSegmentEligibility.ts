import { SegmentPromptInput } from "../contracts/segmentPromptInput.js";
import { SegmentValidationResult } from "./segmentValidationResult.js";

const ZERO_TAG_JUSTIFICATION_TOKENS = ["allow_zero_tags", "no_tags", "tagless"];

const continuityIndicatesRepetitionRisk = (continuityNotes?: string[]): boolean => {
  if (!continuityNotes) return false;
  return continuityNotes.some((note) => /repeat|repetition|again|revisit/i.test(note));
};

const hasZeroTagJustification = (intent: string[]): boolean =>
  intent.some((token) =>
    ZERO_TAG_JUSTIFICATION_TOKENS.some((marker) => token.toLowerCase().includes(marker))
  );

export function validateSegmentEligibility(input: SegmentPromptInput): SegmentValidationResult {
  const blocking_reasons: string[] = [];
  const warnings: string[] = [];

  if (input.intent.length < 1) {
    blocking_reasons.push("intent is empty");
  }

  if (input.constraints.max_ideas < 1) {
    blocking_reasons.push("max_ideas must be at least 1");
  }

  if (input.constraints.ban_repetition && continuityIndicatesRepetitionRisk(input.continuity_notes)) {
    blocking_reasons.push("repetition risk present while repetition is banned");
  }

  if (
    input.included_tags.length === 0 &&
    !hasZeroTagJustification(input.intent)
  ) {
    blocking_reasons.push("included_tags empty without intent justification");
  }

  switch (input.segment_key) {
    case "intro": {
      if (input.constraints.max_ideas !== 1) {
        blocking_reasons.push("intro requires max_ideas === 1");
      }
      break;
    }
    case "main_themes": {
      if (input.constraints.max_ideas < 2) {
        blocking_reasons.push("main_themes requires max_ideas >= 2");
      }
      break;
    }
    case "reflection": {
      if (!input.constraints.must_acknowledge_uncertainty) {
        blocking_reasons.push("reflection must acknowledge uncertainty");
      }
      break;
    }
    case "closing": {
      if (input.constraints.max_ideas !== 1) {
        blocking_reasons.push("closing requires max_ideas === 1");
      }
      break;
    }
    default: {
      blocking_reasons.push(`unsupported segment ${input.segment_key}`);
    }
  }

  const is_valid = blocking_reasons.length === 0;

  return {
    segment_key: input.segment_key,
    is_valid,
    blocking_reasons,
    warnings,
  };
}


