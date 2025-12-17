import "dotenv/config";

import { generateSegmentDraft } from "./crew_cloudia/generation/generateSegmentDraft.js";
import { getWritingContract } from "./crew_cloudia/editorial/contracts/segmentWritingContracts.js";
import { EpisodeEditorialPlan } from "./crew_cloudia/editorial/planner/types.js";
import { SegmentPromptInput } from "./crew_cloudia/editorial/contracts/segmentPromptInput.js";
import { EpisodeValidationResult } from "./crew_cloudia/editorial/validation/episodeValidationResult.js";

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

const episode_plan: EpisodeEditorialPlan = {
  episode_date: "2025-01-01",
  segments: [
    {
      segment_key: "intro",
      intent: ["introduce_one_theme"],
      included_tags: ["theme:one"],
      suppressed_tags: [],
      rationale: ["rule:intro"],
    },
  ],
  continuity_notes: {
    callbacks: [],
    avoided_repetition: [],
  },
  debug: {
    selected_by_segment: {
      intro: ["rule:intro"],
      main_themes: [],
      reflection: [],
      closing: [],
    },
    suppressed_by_rule: {},
  },
};

const segment: SegmentPromptInput = {
  episode_date: "2025-01-01",
  segment_key: "intro",
  intent: ["introduce_one_theme"],
  included_tags: ["theme:one"],
  suppressed_tags: [],
  confidence_level: "high",
  constraints: {
    max_ideas: 1,
    must_acknowledge_uncertainty: false,
    ban_repetition: true,
  },
};

const episode_validation: EpisodeValidationResult = {
  episode_date: "2025-01-01",
  is_valid: true,
  segment_results: [],
  blocking_segments: [],
  warnings: [],
};

async function main() {
  const writing_contract = getWritingContract("intro");
  const result = await generateSegmentDraft({
    episode_plan,
    segment,
    writing_contract,
    episode_validation,
  });

  console.dir(result, { depth: null });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

