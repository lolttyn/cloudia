import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDailyFactsRange, type LoadMode } from "../getDailyFactsRange.js";
import { loadDailyFactsRange } from "../loadDailyFactsRange.js";
import { getSkyStateRange } from "../../../ephemeris/persistence/getSkyStateRange.js";
import { deriveDailyFactsFromSkyState } from "../../astrologyTechnician.js";
import { upsertDailyFacts } from "../upsertDailyFacts.js";
import { TECHNICIAN_POLICY_V1 } from "../../policy/technicianPolicy.v1.js";
import type { DailyFacts } from "../../schema/dailyFacts.schema.js";
import type { SkyState } from "../../../../astro/schemas/skyState.schema.js";

// Mock dependencies
vi.mock("../loadDailyFactsRange.js");
vi.mock("../../../ephemeris/persistence/getSkyStateRange.js");
vi.mock("../../astrologyTechnician.js");
vi.mock("../upsertDailyFacts.js");
vi.mock("../../../../../lib/supabaseClient", () => ({
  supabase: {},
}));

describe("getDailyFactsRange", () => {
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
      moon: {
        longitude: 45.2,
        speed_deg_per_day: 13.2,
        retrograde: false,
        sign: "taurus",
        sign_degree: 15.2,
      },
    },
    aspects: [],
    lunar: {
      phase_name: "new",
      phase_angle_deg: 0,
      illumination_pct: 0,
    },
  };

  const mockDailyFacts: DailyFacts = {
    schema_version: "1.0.0",
    technician_policy_version: "tech_v1",
    date: "2026-01-15",
    timestamp_generated: "2026-01-15T12:00:00.000Z",
    source: {
      sky_state_schema_version: "1.0.0",
      engine: "swisseph",
      engine_version: "test",
      ephemeris_fileset: "test",
    },
    transits_primary: [],
    transits_secondary: [],
    background_conditions: [],
    excluded: [],
    interpreter_transits_v1: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read_only mode", () => {
    it("returns map with missing dates as null", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
        "2026-01-17": mockDailyFacts,
      });

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-17",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
        "2026-01-17": mockDailyFacts,
      });
      expect(deriveDailyFactsFromSkyState).not.toHaveBeenCalled();
      expect(upsertDailyFacts).not.toHaveBeenCalled();
    });

    it("returns map with all nulls if no dates loaded", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": null,
        "2026-01-16": null,
      });

      const result = await getDailyFactsRange(
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
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": mockDailyFacts,
      });

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-16",
        "require"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": mockDailyFacts,
      });
    });

    it("throws if any date is missing", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
      });

      await expect(
        getDailyFactsRange("2026-01-15", "2026-01-16", "require")
      ).rejects.toThrow("Missing daily_facts for dates: 2026-01-16");
    });

    it("throws if schema_version mismatch", async () => {
      const mismatchedFacts = {
        ...mockDailyFacts,
        schema_version: "2.0.0",
      };

      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mismatchedFacts as DailyFacts,
      });

      await expect(
        getDailyFactsRange("2026-01-15", "2026-01-15", "require")
      ).rejects.toThrow(
        'Schema version mismatch for 2026-01-15: expected "1.0.0", got "2.0.0"'
      );
    });

    it("throws if technician_policy_version mismatch", async () => {
      const mismatchedFacts = {
        ...mockDailyFacts,
        technician_policy_version: "tech_v2",
      };

      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mismatchedFacts as DailyFacts,
      });

      await expect(
        getDailyFactsRange("2026-01-15", "2026-01-15", "require")
      ).rejects.toThrow(
        'Technician policy version mismatch for 2026-01-15: expected "tech_v1", got "tech_v2"'
      );
    });
  });

  describe("compute_on_miss mode", () => {
    it("computes and persists missing dates", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
      });

      const skyStateFor16: SkyState = {
        ...mockSkyState,
        timestamp: {
          ...mockSkyState.timestamp,
          date: "2026-01-16",
          utc_datetime: "2026-01-16T12:00:00.000Z",
        },
      };

      const factsFor16: DailyFacts = {
        ...mockDailyFacts,
        date: "2026-01-16",
        timestamp_generated: "2026-01-16T12:00:00.000Z",
      };

      vi.mocked(getSkyStateRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
        "2026-01-16": skyStateFor16,
      });

      vi.mocked(deriveDailyFactsFromSkyState).mockReturnValue(factsFor16);
      vi.mocked(upsertDailyFacts).mockResolvedValue(undefined);

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-16",
        "compute_on_miss"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": factsFor16,
      });

      // Should call getSkyStateRange in compute_on_miss mode
      expect(getSkyStateRange).toHaveBeenCalledTimes(1);
      expect(getSkyStateRange).toHaveBeenCalledWith(
        "2026-01-15",
        "2026-01-16",
        "compute_on_miss"
      );

      // Should derive facts from persisted sky_state
      expect(deriveDailyFactsFromSkyState).toHaveBeenCalledTimes(1);
      expect(deriveDailyFactsFromSkyState).toHaveBeenCalledWith(
        skyStateFor16,
        TECHNICIAN_POLICY_V1,
        "2026-01-16"
      );

      // Should persist the derived facts
      expect(upsertDailyFacts).toHaveBeenCalledTimes(1);
      expect(upsertDailyFacts).toHaveBeenCalledWith(factsFor16);
    });

    it("does not compute if all dates present", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": mockDailyFacts,
      });

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-16",
        "compute_on_miss"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": mockDailyFacts,
      });

      expect(deriveDailyFactsFromSkyState).not.toHaveBeenCalled();
      expect(upsertDailyFacts).not.toHaveBeenCalled();
    });

    it("throws if loaded facts have schema_version mismatch", async () => {
      const mismatchedFacts = {
        ...mockDailyFacts,
        schema_version: "2.0.0",
      };

      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mismatchedFacts as DailyFacts,
        "2026-01-16": null,
      });

      await expect(
        getDailyFactsRange("2026-01-15", "2026-01-16", "compute_on_miss")
      ).rejects.toThrow("Schema version mismatch");
    });

    it("throws if sky_state is missing and cannot be computed", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": null,
      });

      vi.mocked(getSkyStateRange).mockResolvedValue({
        "2026-01-15": mockSkyState,
      });

      // Simulate sky_state missing for the date
      const skyStatesWithoutDate: Record<string, SkyState> = {};

      vi.mocked(getSkyStateRange).mockResolvedValue(skyStatesWithoutDate);

      await expect(
        getDailyFactsRange("2026-01-15", "2026-01-15", "compute_on_miss")
      ).rejects.toThrow("Cannot compute daily_facts for 2026-01-15: sky_state is missing");
    });
  });

  describe("date range handling", () => {
    it("handles single day range", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
      });

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-15",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
      });
    });

    it("handles multi-day range", async () => {
      vi.mocked(loadDailyFactsRange).mockResolvedValue({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
        "2026-01-17": null,
        "2026-01-18": mockDailyFacts,
        "2026-01-19": null,
      });

      const result = await getDailyFactsRange(
        "2026-01-15",
        "2026-01-19",
        "read_only"
      );

      expect(result).toEqual({
        "2026-01-15": mockDailyFacts,
        "2026-01-16": null,
        "2026-01-17": null,
        "2026-01-18": mockDailyFacts,
        "2026-01-19": null,
      });
    });
  });
});

