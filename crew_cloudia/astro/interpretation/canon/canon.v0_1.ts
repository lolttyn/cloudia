import { InterpretationLayerSchema } from "../schema/ikb.schemas";
import { CanonConstraintSchema } from "./canon.schemas";

const CANON_VERSION = "0.1" as const;

const baseConstraints = [
  {
    id: "determinism.language",
    version: CANON_VERSION,
    description: "Avoid deterministic or guaranteed-outcome language.",
    applies_to: InterpretationLayerSchema.options,
    enforcement: "review",
    detectors: [
      {
        kind: "phrase_list",
        phrases: ["destined", "fated", "guaranteed", "inevitable"],
      },
      {
        kind: "regex",
        pattern: "\\bwill\\s+happen\\b",
        flags: "i",
      },
    ],
    examples: {
      allow: ["Likely shift ahead if you adapt."],
      block: ["This will happen exactly as written"],
    },
  },
  {
    id: "medical.claims",
    version: CANON_VERSION,
    description: "Block medical or diagnostic claims.",
    applies_to: InterpretationLayerSchema.options,
    enforcement: "block",
    detectors: [
      {
        kind: "phrase_list",
        phrases: [
          "medical advice",
          "diagnose",
          "diagnosis",
          "cure",
          "treat",
        ],
      },
      {
        kind: "regex",
        pattern: "\\b(blood pressure|clinical|prescription)\\b",
        flags: "i",
      },
    ],
    examples: {
      allow: ["Consult a licensed clinician for medical questions."],
      block: ["This cures anxiety and replaces clinical care"],
    },
  },
] as const;

export const CANON_V0_1 = baseConstraints.map((constraint) =>
  CanonConstraintSchema.parse(constraint)
);

export type CanonV0_1Constraint = (typeof CANON_V0_1)[number];
export const CANON_V0_1_VERSION = CANON_VERSION;

