import {
  CanonConstraint,
  DetectorSpec,
} from "../canon/canon.schemas.js";
import { DailyInterpretation } from "../schema/ikb.schemas.js";

type CanonStatus = "pass" | "fail";

export type CanonCheck = {
  constraint_id: string;
  status: CanonStatus;
  evidence?: string;
};

function collectSnippets(interpretation: DailyInterpretation): string[] {
  const values: string[] = [];
  const push = (maybe: unknown) => {
    if (Array.isArray(maybe)) {
      maybe.forEach((v) => typeof v === "string" && values.push(v));
    }
  };

  push(interpretation.layers.A.focus);
  push(interpretation.layers.A.interpretation);
  push(interpretation.layers.A.rationale);
  push(interpretation.layers.A.highlights);

  push(interpretation.layers.B.focus);
  push(interpretation.layers.B.interpretation);
  push(interpretation.layers.B.rationale);
  push(interpretation.layers.B.risks);
  push(interpretation.layers.B.mitigations);

  push(interpretation.layers.C.focus);
  push(interpretation.layers.C.interpretation);
  push(interpretation.layers.C.rationale);
  push(interpretation.layers.C.opportunities);
  push(interpretation.layers.C.actions);

  push(interpretation.layers.D.focus);
  push(interpretation.layers.D.interpretation);
  push(interpretation.layers.D.rationale);
  push(interpretation.layers.D.signals);
  push(interpretation.layers.D.counter_signals);

  return values;
}

function detect(
  text: string,
  detector: DetectorSpec
): boolean {
  if (detector.kind === "phrase_list") {
    const phrases = detector.case_sensitive
      ? detector.phrases
      : detector.phrases.map((p) => p.toLowerCase());
    const haystack = detector.case_sensitive ? text : text.toLowerCase();
    return phrases.some((phrase) => haystack.includes(phrase));
  }
  if (detector.kind === "regex") {
    const re = new RegExp(detector.pattern, detector.flags);
    return re.test(text);
  }
  return false;
}

export function evaluateCanon(
  interpretation: DailyInterpretation,
  constraints: CanonConstraint[]
): { canon_checks: CanonCheck[]; hard_blocked: boolean } {
  const snippets = collectSnippets(interpretation);
  const checks: CanonCheck[] = [];
  let hardBlocked = false;

  for (const constraint of constraints) {
    const hit = snippets.find((text) =>
      constraint.detectors.some((d) => detect(text, d))
    );
    const status: CanonStatus = hit ? "fail" : "pass";
    if (status === "fail" && constraint.enforcement === "block") {
      hardBlocked = true;
    }
    checks.push({
      constraint_id: constraint.id,
      status,
      evidence: hit,
    });
  }

  return { canon_checks: checks, hard_blocked: hardBlocked };
}

