import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSkyStateRange, type LoadMode } from "../getSkyStateRange.js";
import { loadSkyStateDailyRange } from "../loadSkyStateDailyRange.js";
import { computeSkyState } from "../../../../../astro/computeSkyState.js";
import { upsertSkyStateDaily } from "../upsertSkyStateDaily.js";
import type { SkyState } from "../../../../../astro/schemas/skyState.schema.js";

// Mock dependencies
vi.mock("../loadSkyStateDailyRange.js");
vi.mock("../../../../../astro/computeSkyState.js");
vi.mock("../upsertSkyStateDaily.js");
vi.mock("../../../lib/supabaseClient", () => ({
  supabase: {},
}));

describe("getSkyStateRange", () => {
  const mockSkyState: SkyState = {
    schema_version: "1.0.0",
    meta: {
      engine: "swisseph",
      engine_version: "test",
      ephemeris_fileset: "test",
      coordinate_system: "tropical",
      timestamp_generated: "2026-01-15T12:00:00.000Z",
    },
    timestamp: {
      date: "2026-01-15",
      utc_datetime: "2026-01-15T12:00:00.000Z",
      timezone: "UTC",
      julian_day: 2460312.0,
    },
    bodies: {
      sun: {
        longitude: 281.5,
        speed_deg_per_day: 1.0,
        retrograde: false,
        sign: "capricorn",
        sign_degree: 11.5,
      },
    },
    aspects: [],
    lunar: {
      phase_name: "new",
      phase_angle_deg: 0,
      illumination_pct: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read_only mode", () => {
    it("returns map with missing dates as null", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": null,
        "2026-01-17": mockSkyState,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-17",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
        "2026-01-16": null,
        "2026-01-17": mockSkyState,
      });
      expect(computeSkyState).not.toHaveBeenCalled();
      expect(upsertSkyStateDaily).not.toHaveBeenCalled();
    });

    it("returns map with all nulls if no dates loaded", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": null,
        "2026-01-16": null,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-16",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": null,
        "2026-01-16": null,
      });
    });
  });

  describe("require mode", () => {
    it("returns all dates if all present", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": mockSkyState,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-16",
        "require"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
        "2026-01-16": mockSkyState,
      });
    });

    it("throws if any date is missing", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": null,
      });

      await expect(
        getSkyStateRange("2026-01-15", "2026-01-16", "require")
      ).rejects.toThrow("Missing sky_state for dates: 2026-01-16");
    });

    it("throws if schema_version mismatch", async () => {
      const mismatchedState = {
        ...mockSkyState,
        schema_version: "2.0.0" as const,
      };

      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mismatchedState as SkyState,
      });

      await expect(
        getSkyStateRange("2026-01-15", "2026-01-15", "require")
      ).rejects.toThrow(
        'Schema version mismatch for 2026-01-15: expected "1.0.0", got "2.0.0"'
      );
    });
  });

  describe("compute_on_miss mode", () => {
    it("computes and persists missing dates", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": null,
      });

      const computedState: SkyState = {
        ...mockSkyState,
        timestamp: {
          ...mockSkyState.timestamp,
          date: "2026-01-16",
          utc_datetime: "2026-01-16T12:00:00.000Z",
        },
      };

      vi.mocked(computeSkyState).mockResolvedValue(computedState);
      vi.mocked(upsertSkyStateDaily).mockResolvedValue(undefined);

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-16",
        "compute_on_miss"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
        "2026-01-16": computedState,
      });

      expect(computeSkyState).toHaveBeenCalledTimes(1);
      expect(computeSkyState).toHaveBeenCalledWith({
        date: "2026-01-16",
        timezone: "UTC",
      });

      expect(upsertSkyStateDaily).toHaveBeenCalledTimes(1);
      expect(upsertSkyStateDaily).toHaveBeenCalledWith(computedState);
    });

    it("does not compute if all dates present", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": mockSkyState,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-16",
        "compute_on_miss"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
        "2026-01-16": mockSkyState,
      });

      expect(computeSkyState).not.toHaveBeenCalled();
      expect(upsertSkyStateDaily).not.toHaveBeenCalled();
    });

    it("throws if loaded state has schema_version mismatch", async () => {
      const mismatchedState = {
        ...mockSkyState,
        schema_version: "2.0.0" as const,
      };

      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mismatchedState as SkyState,
        "2026-01-16": null,
      });

      await expect(
        getSkyStateRange("2026-01-15", "2026-01-16", "compute_on_miss")
      ).rejects.toThrow("Schema version mismatch");
    });
  });

  describe("date range handling", () => {
    it("handles single day range", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-15",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
      });
    });

    it("handles multi-day range", async () => {
      vi.mocked(loadSkyStateDailyRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": null,
        "2026-01-17": null,
        "2026-01-18": mockSkyState,
        "2026-01-19": null,
      });

      const result = await getSkyStateRange(
        "2026-01-15",
        "2026-01-19",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockSkyState,
        "2026-01-18": mockSkyState,
      });
    });
  });
});

