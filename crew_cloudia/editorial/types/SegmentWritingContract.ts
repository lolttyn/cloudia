export type SegmentWritingContract = {
  segment_key: string;
  segment_kind: string;

  intent: "explain" | "interpret" | "reflect" | "close" | "orient";

  required_sections: {
    key: string;
    description: string;
    required: boolean;
    enforcement: "structural" | "semantic";
  }[];

  forbidden_elements: {
    phrases: string[];
    claims: string[];
    tones: string[];
  };

  voice_constraints: {
    perspective: "first_person" | "second_person";
    allowed_tones: string[];
    disallowed_tones: string[];
  };

  length_constraints: {
    min_words: number;
    max_words: number;
  };

  formatting_rules: {
    allow_bullets: boolean;
    allow_questions: boolean;
  };
};

