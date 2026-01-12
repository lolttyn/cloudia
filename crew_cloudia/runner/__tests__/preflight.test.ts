/**
 * Preflight Gate Tests
 * 
 * Tests Layer 0 (sky_state_daily) preflight gate behavior:
 * - AUTO-SEED when missing dates found
 * - --no-preseed flag behavior
 * - --preseed-only flag behavior
 * - Re-check enforcement after seeding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
const mockLoadSkyStateDailyRange = vi.fn();
const mockSeedSkyStateRange = vi.fn();

vi.mock("../../astro/ephemeris/persistence/loadSkyStateDailyRange.js", () => ({
  loadSkyStateDailyRange: (...args: any[]) => mockLoadSkyStateDailyRange(...args),
}));

vi.mock("../../tools/ephemeris/seedSkyStateRange.js", () => ({
  seedSkyStateRange: (...args: any[]) => mockSeedSkyStateRange(...args),
}));

// Mock other runner dependencies to prevent full execution
vi.mock("../../../run-intro.js", () => ({
  runIntroForDate: vi.fn(),
}));

vi.mock("../../../run-main-themes.js", () => ({
  runMainThemesForDate: vi.fn(),
}));

vi.mock("../../../run-closing.js", () => ({
  runClosingForDate: vi.fn(),
}));

vi.mock("../../editorial/gate/evaluateEpisodeGate.js", () => ({
  evaluateEpisodeGate: vi.fn(),
}));

vi.mock("../../editorial/gate/persistEpisodeGateResult.js", () => ({
  persistEpisodeGateResult: vi.fn(),
}));

vi.mock("../../interpretation/runInterpreter.js", () => ({
  runInterpreter: vi.fn(),
}));

vi.mock("../../astro/interpretation/runInterpreterCanonical.js", () => ({
  runInterpreterCanonical: vi.fn(),
}));

vi.mock("../../editorial/gates/assertEpisodeIsPublishable.js", () => ({
  assertEpisodeIsPublishable: vi.fn(),
}));

describe("Preflight Gate", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "test", "cloudia", "2026-01-01", "--window-days", "3"];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("AUTO-SEED: seeds missing dates and proceeds", async () => {
    // First call: missing dates
    mockLoadSkyStateDailyRange
      .mockResolvedValueOnce({
        "2026-01-01": null, // missing
        "2026-01-02": { schema_version: "1.0.0" }, // exists
        "2026-01-03": null, // missing
      })
      // Second call after seeding: all present
      .mockResolvedValueOnce({
        "2026-01-01": { schema_version: "1.0.0" },
        "2026-01-02": { schema_version: "1.0.0" },
        "2026-01-03": { schema_version: "1.0.0" },
      });

    mockSeedSkyStateRange.mockResolvedValue(undefined);

    // Import after mocks are set up
    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await ensurePrereqsForRange({
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      noPreseed: false,
    });

    // Should have called seeder with contiguous ranges
    expect(mockSeedSkyStateRange).toHaveBeenCalledTimes(2);
    expect(mockSeedSkyStateRange).toHaveBeenCalledWith("2026-01-01", "2026-01-01");
    expect(mockSeedSkyStateRange).toHaveBeenCalledWith("2026-01-03", "2026-01-03");

    // Should have re-checked coverage
    expect(mockLoadSkyStateDailyRange).toHaveBeenCalledTimes(2);
  });

  it("AUTO-SEED: compresses contiguous missing dates into single range", async () => {
    // Missing dates: 2026-01-01, 2026-01-02, 2026-01-03 (contiguous)
    mockLoadSkyStateDailyRange
      .mockResolvedValueOnce({
        "2026-01-01": null,
        "2026-01-02": null,
        "2026-01-03": null,
      })
      .mockResolvedValueOnce({
        "2026-01-01": { schema_version: "1.0.0" },
        "2026-01-02": { schema_version: "1.0.0" },
        "2026-01-03": { schema_version: "1.0.0" },
      });

    mockSeedSkyStateRange.mockResolvedValue(undefined);

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await ensurePrereqsForRange({
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      noPreseed: false,
    });

    // Should compress to single range
    expect(mockSeedSkyStateRange).toHaveBeenCalledTimes(1);
    expect(mockSeedSkyStateRange).toHaveBeenCalledWith("2026-01-01", "2026-01-03");
  });

  it("AUTO-SEED: throws if seeding fails", async () => {
    mockLoadSkyStateDailyRange.mockResolvedValueOnce({
      "2026-01-01": null,
      "2026-01-02": null,
    });

    const seedingError = new Error("Seeder failed");
    mockSeedSkyStateRange.mockRejectedValue(seedingError);

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await expect(
      ensurePrereqsForRange({
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        noPreseed: false,
      })
    ).rejects.toThrow("Seeder failed");
  });

  it("AUTO-SEED: throws if coverage still missing after seeding", async () => {
    // Missing before and after seeding
    mockLoadSkyStateDailyRange
      .mockResolvedValueOnce({
        "2026-01-01": null,
      })
      .mockResolvedValueOnce({
        "2026-01-01": null, // Still missing
      });

    mockSeedSkyStateRange.mockResolvedValue(undefined);

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await expect(
      ensurePrereqsForRange({
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        noPreseed: false,
      })
    ).rejects.toThrow("Layer 0 preseed attempted but coverage is still missing");
  });

  it("--no-preseed: throws with exact seed commands when missing", async () => {
    mockLoadSkyStateDailyRange.mockResolvedValueOnce({
      "2026-01-01": null,
      "2026-01-02": { schema_version: "1.0.0" },
      "2026-01-03": null,
    });

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await expect(
      ensurePrereqsForRange({
        startDate: "2026-01-01",
        endDate: "2026-01-03",
        noPreseed: true,
      })
    ).rejects.toThrow("Missing Layer 0 sky_state_daily");

    // Should NOT call seeder
    expect(mockSeedSkyStateRange).not.toHaveBeenCalled();

    // Error should include exact commands
    try {
      await ensurePrereqsForRange({
        startDate: "2026-01-01",
        endDate: "2026-01-03",
        noPreseed: true,
      });
    } catch (err: any) {
      expect(err.message).toContain("npx tsx crew_cloudia/tools/ephemeris/seedSkyStateRange.ts");
      expect(err.message).toContain("2026-01-01");
      expect(err.message).toContain("2026-01-03");
    }
  });

  it("--no-preseed: succeeds when coverage is complete", async () => {
    mockLoadSkyStateDailyRange.mockResolvedValueOnce({
      "2026-01-01": { schema_version: "1.0.0" },
      "2026-01-02": { schema_version: "1.0.0" },
      "2026-01-03": { schema_version: "1.0.0" },
    });

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await ensurePrereqsForRange({
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      noPreseed: true,
    });

    // Should not call seeder
    expect(mockSeedSkyStateRange).not.toHaveBeenCalled();
  });

  it("coverage check: returns early when no missing dates", async () => {
    mockLoadSkyStateDailyRange.mockResolvedValueOnce({
      "2026-01-01": { schema_version: "1.0.0" },
      "2026-01-02": { schema_version: "1.0.0" },
    });

    const { ensurePrereqsForRange } = await import("../runEpisodeBatch.js");

    await ensurePrereqsForRange({
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      noPreseed: false,
    });

    // Should not call seeder
    expect(mockSeedSkyStateRange).not.toHaveBeenCalled();
    // Should only check once (no re-check needed)
    expect(mockLoadSkyStateDailyRange).toHaveBeenCalledTimes(1);
  });
});
