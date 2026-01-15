import { InterpretiveFrame } from "../../interpretation/schema/InterpretiveFrame.js";

export type AdherenceSegmentKey = "intro" | "main_themes" | "closing" | string;

export type ScoreAdjustment = {
  code: string;
  delta: number;
  reason: string;
};

export type AdherenceInput = {
  script: string;
  segment_key: AdherenceSegmentKey;
  interpretive_frame: InterpretiveFrame;
  previous_closings?: string[];
  episode_date?: string; // YYYY-MM-DD for logging
};

export type AdherenceResult = {
  blocking_reasons: string[];
  warnings: string[];
  score: number;
  score_breakdown: ScoreAdjustment[];
};

