/**
 * Editor Instruction Synthesis
 *
 * Translates rubric blocking reasons into actionable, human edit instructions.
 * This is the missing layer between evaluation and revision.
 *
 * No labels go to the writer. Only instructions.
 */

export type AdherenceSegmentKey = "intro" | "main_themes" | "closing" | string;

export function generateEditInstructions(
  blockingReasons: string[],
  segmentKey: AdherenceSegmentKey
): string[] {
  const instructions: string[] = [];

  for (const reason of blockingReasons) {
    switch (true) {
      case reason.startsWith("HARD_BANNED_LANGUAGE"):
        // Extract the specific banned phrase if available
        const bannedPhrase = reason.includes(":")
          ? reason.split(":")[1]?.trim()
          : "abstract rubric scaffolding";
        instructions.push(
          `Remove "${bannedPhrase}" and any similar abstract framing. Replace it with how the day feels or shows up in real life.`
        );
        break;

      case reason === "SYSTEM_LEVEL_EXPLANATION":
        instructions.push(
          "Do not explain astrology. Translate it into lived human experience instead. Assume the listener trusts you; you don't need to justify your statements."
        );
        break;

      case reason === "LUNATION_NOT_FRONT_LOADED":
        instructions.push(
          "Begin with how the lunation feels or what is opening or closing before mentioning astronomical details or chronology."
        );
        break;

      case reason === "NO_RELATIONAL_TRANSLATION":
        instructions.push(
          "Add a concrete human scenario, emotion, or bodily sensation to ground the idea. Use specific, contemporary referents (texts, meetings, body sensations, conversations)."
        );
        break;

      case reason === "NO_BEHAVIORAL_AFFORDANCE":
        instructions.push(
          "Offer a clear permission, timing cue, or usable stance (act, wait, rest, name, avoid). Use direct language like 'you don't have to', 'take the space', 'stop', 'skip'."
        );
        break;

      case reason === "ABSTRACT_WITHOUT_TRANSLATION":
        instructions.push(
          "Translate abstract concepts (meaning, values, themes) into concrete human situations. Show how it shows up, don't just name it."
        );
        break;

      case reason === "REPEATED_CLOSING_TEMPLATE":
        instructions.push(
          "This closing is too similar to a previous one. Rewrite with different language and structure while preserving the reflective tone."
        );
        break;

      case reason.startsWith("closing:tone_mismatch_phase"):
        instructions.push(
          "The tone doesn't match the temporal phase. Soften escalation language to match releasing/aftershock energy."
        );
        break;

      case reason.startsWith("intro:") || reason.startsWith("closing:"):
        // Structural issues (greeting missing, scaffold issues, etc.)
        // These are usually caught by frame evaluator, but pass through as-is
        instructions.push(`Fix structural issue: ${reason}`);
        break;

      default:
        // Unknown blocking reason - still provide instruction
        instructions.push(
          `Address the issue flagged as: ${reason}. Revise the text to resolve it.`
        );
        break;
    }
  }

  // Segment-specific guardrails
  if (segmentKey === "intro") {
    // Ensure intro-specific guidance
    if (
      blockingReasons.some(
        (r) =>
          r === "SYSTEM_LEVEL_EXPLANATION" ||
          r === "LUNATION_NOT_FRONT_LOADED" ||
          r.startsWith("HARD_BANNED_LANGUAGE")
      )
    ) {
      instructions.push(
        "Do not summarize the day as a theme. Start from lived experience, not abstract description."
      );
    }
  }

  if (segmentKey === "main_themes") {
    // Ensure main_themes gets translation pressure
    if (
      blockingReasons.some(
        (r) =>
          r === "NO_RELATIONAL_TRANSLATION" ||
          r === "ABSTRACT_WITHOUT_TRANSLATION"
      )
    ) {
      instructions.push(
        "Focus on translation, not explanation. Show how ideas show up in real people's days, not what they mean conceptually."
      );
    }
  }

  if (segmentKey === "closing") {
    // Ensure closing avoids repetition
    if (blockingReasons.includes("REPEATED_CLOSING_TEMPLATE")) {
      instructions.push(
        "End with integration, not summary. Reflect the day back in human terms without restating earlier language."
      );
    }
  }

  // Always ensure we have at least one instruction if there were blocking reasons
  if (instructions.length === 0 && blockingReasons.length > 0) {
    instructions.push(
      "Revise the text to address the blocking reasons listed above."
    );
  }

  return instructions;
}

