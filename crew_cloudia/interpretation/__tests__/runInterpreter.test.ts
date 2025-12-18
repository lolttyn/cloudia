import { describe, expect, it } from "vitest";
import { runInterpreter } from "../runInterpreter.js";
import { InterpretiveFrameSchema } from "../schema/InterpretiveFrame.js";

describe("runInterpreter (stub)", () => {
  it("returns a schema-valid frame for 2025-12-18", async () => {
    const frame = await runInterpreter({ date: "2025-12-18" });

    expect(() => InterpretiveFrameSchema.parse(frame)).not.toThrow();
    expect(frame.date).toBe("2025-12-18");
    expect(frame.sky_anchors.length).toBeGreaterThanOrEqual(2);
  });

  it("throws for unsupported dates", async () => {
    await expect(runInterpreter({ date: "2025-12-19" })).rejects.toThrow();
  });
});

