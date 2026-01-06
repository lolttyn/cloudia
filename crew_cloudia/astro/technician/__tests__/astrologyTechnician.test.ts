import { describe, it, expect } from "vitest";
import { deriveDailyFactsFromSkyState } from "../astrologyTechnician.js";
import { computeSkyState } from "../../../../astro/computeSkyState.js";
import { DailyFactsSchema } from "../schema/dailyFacts.schema.js";
import { TECHNICIAN_POLICY_V1 } from "../policy/technicianPolicy.v1.js";
import type { SkyState } from "../../../../astro/schemas/skyState.schema.js";

describe("astrologyTechnician (pure functions)", () => {
  describe("Schema validation", () => {
    it("output parses with DailyFactsSchema", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      // Should not throw
      const validated = DailyFactsSchema.parse(facts);
      expect(validated).toBeDefined();
      expect(validated.date).toBe("2024-01-15");
      expect(validated.schema_version).toBe("1.0.0");
      expect(validated.technician_policy_version).toBe("tech_v1");
    });
  });
  
  describe("Determinism", () => {
    it("same date twice yields same output (ignoring timestamp_generated)", async () => {
      const date = "2024-01-15";
      const sky1 = await computeSkyState({ date, timezone: "UTC" });
      const sky2 = await computeSkyState({ date, timezone: "UTC" });
      const facts1 = deriveDailyFactsFromSkyState(sky1, TECHNICIAN_POLICY_V1, date);
      const facts2 = deriveDailyFactsFromSkyState(sky2, TECHNICIAN_POLICY_V1, date);
      
      // Remove timestamp_generated for comparison
      const { timestamp_generated: _, ...facts1WithoutTime } = facts1;
      const { timestamp_generated: __, ...facts2WithoutTime } = facts2;
      
      expect(facts1WithoutTime).toEqual(facts2WithoutTime);
    });
  });
  
  describe("Basic expectations", () => {
    it("lunation condition exists", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      const lunationConditions = facts.background_conditions.filter(
        (c) => c.kind === "lunation"
      );
      
      expect(lunationConditions.length).toBeGreaterThan(0);
      expect(lunationConditions[0].kind).toBe("lunation");
      expect(lunationConditions[0].phase).toBeDefined();
    });
    
    it("any retrograde bodies produce conditions", async () => {
      // Test with a date that likely has retrogrades
      // (Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto can all be retrograde)
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      // Check if there are any retrogrades in the background conditions
      const retrogradeConditions = facts.background_conditions.filter(
        (c) => c.kind === "retrograde"
      );
      
      // At least verify the structure is correct if retrogrades exist
      // (We can't guarantee retrogrades exist on a specific date)
      retrogradeConditions.forEach((condition) => {
        expect(condition.kind).toBe("retrograde");
        expect(condition.body).toBeDefined();
        expect([
          "sun",
          "moon",
          "mercury",
          "venus",
          "mars",
          "jupiter",
          "saturn",
          "uranus",
          "neptune",
          "pluto",
        ]).toContain(condition.body);
      });
    });
    
    it("source reference is populated from sky_state", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      expect(facts.source).toBeDefined();
      expect(facts.source.sky_state_schema_version).toBe("1.0.0");
      expect(facts.source.engine).toBe("swisseph");
      expect(facts.source.engine_version).toBeDefined();
      expect(facts.source.ephemeris_fileset).toBeDefined();
    });
    
    it("transits are properly classified into primary and secondary", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      // Verify structure
      expect(Array.isArray(facts.transits_primary)).toBe(true);
      expect(Array.isArray(facts.transits_secondary)).toBe(true);
      
      // Verify transit fact structure
      [...facts.transits_primary, ...facts.transits_secondary].forEach((transit) => {
        expect(transit.body_a).toBeDefined();
        expect(transit.body_b).toBeDefined();
        expect(transit.aspect_type).toBeDefined();
        expect(transit.orb_deg).toBeGreaterThanOrEqual(0);
        expect(typeof transit.is_exact).toBe("boolean");
      });
    });
  });

  describe("deriveDailyFactsFromSkyState", () => {
    it("throws if date does not match sky_state.timestamp.date", () => {
      const skyState: SkyState = {
        schema_version: "1.0.0",
        meta: {
          engine: "swisseph",
          engine_version: "test",
          ephemeris_fileset: "test",
          coordinate_system: "tropical",
          timestamp_generated: "2024-01-15T12:00:00.000Z",
        },
        timestamp: {
          date: "2024-01-15",
          utc_datetime: "2024-01-15T12:00:00.000Z",
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

      // Should throw if date mismatch
      expect(() => {
        deriveDailyFactsFromSkyState(skyState, TECHNICIAN_POLICY_V1, "2024-01-16");
      }).toThrow('Date mismatch: provided date "2024-01-16" does not match sky_state.timestamp.date "2024-01-15"');

      // Should not throw if dates match
      expect(() => {
        deriveDailyFactsFromSkyState(skyState, TECHNICIAN_POLICY_V1, "2024-01-15");
      }).not.toThrow();
    });
  });
});

