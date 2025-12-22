import { describe, expect, it } from "vitest";
import { evaluateLexicalFatigue, FATIGUE_REWRITE } from "../lexicalFatigue.js";

const stubHistoryFetcher = () =>
  Promise.resolve([
    {
      episode_date: "2025-01-01",
      segment_key: "main_themes",
      script_text:
        "You might notice rhythm around your calendar today. For example, the room feels crowded. You can let it pass.",
    },
    {
      episode_date: "2025-01-02",
      segment_key: "main_themes",
      script_text:
        "You might notice rhythm around your calendar again. For example, meetings stacking. You can give yourself permission to move one.",
    },
    {
      episode_date: "2025-01-02",
      segment_key: "intro",
      script_text: "Step back from the details to see the bigger picture.",
    },
    {
      episode_date: "2025-01-03",
      segment_key: "closing",
      script_text: "A softer way to step back from the details is to notice the bigger picture quietly.",
    },
  ]);

describe("evaluateLexicalFatigue", () => {
  it("flags surface-level repetition within the rolling window and produces rewrite guidance", async () => {
    const assessment = await evaluateLexicalFatigue({
      episode_date: "2025-01-04",
      segment_key: "main_themes",
      script_text:
        "You might notice rhythm around your schedule again today. For example, the room around your schedule feels busy. You can step back from the details and let something change.",
      fetcher: stubHistoryFetcher,
    });

    expect(assessment.result.repeated_phrases).toContain("step back from the details");
    expect(assessment.result.repeated_openings).toContain("you might notice rhythm around your");
    expect(assessment.result.metaphor_conflicts).toHaveLength(0);
    expect(assessment.result.structural_echo).toBe(true);
    expect(assessment.result.score).toBeGreaterThanOrEqual(FATIGUE_REWRITE);
    expect(assessment.severity).toBe("rewrite");
    expect(assessment.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("step back from the details"),
        expect.stringContaining("Start with something other than"),
        expect.stringContaining("structural pattern"),
      ])
    );
  });

  it("returns ok when no prior scripts are provided", async () => {
    const assessment = await evaluateLexicalFatigue({
      episode_date: "2025-01-04",
      segment_key: "intro",
      script_text: "Today is clear and steady. Keep it simple.",
      fetcher: async () => [],
    });

    expect(assessment.result.score).toBe(0);
    expect(assessment.severity).toBe("ok");
    expect(assessment.instructions).toHaveLength(0);
  });
});
