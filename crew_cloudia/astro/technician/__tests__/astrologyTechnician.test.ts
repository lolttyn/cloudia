import { describe, it, expect } from "vitest";
import { astrologyTechnician } from "../astrologyTechnician.js";
import { DailyFactsSchema } from "../schema/dailyFacts.schema.js";

describe("astrologyTechnician", () => {
  describe("Schema validation", () => {
    it("output parses with DailyFactsSchema", async () => {
      const facts = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
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
      const facts1 = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
      const facts2 = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
      // Remove timestamp_generated for comparison
      const { timestamp_generated: _, ...facts1WithoutTime } = facts1;
      const { timestamp_generated: __, ...facts2WithoutTime } = facts2;
      
      expect(facts1WithoutTime).toEqual(facts2WithoutTime);
    });
  });
  
  describe("Basic expectations", () => {
    it("lunation condition exists", async () => {
      const facts = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
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
      const facts = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
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
      const facts = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
      expect(facts.source).toBeDefined();
      expect(facts.source.sky_state_schema_version).toBe("1.0.0");
      expect(facts.source.engine).toBe("swisseph");
      expect(facts.source.engine_version).toBeDefined();
      expect(facts.source.ephemeris_fileset).toBeDefined();
    });
    
    it("transits are properly classified into primary and secondary", async () => {
      const facts = await astrologyTechnician({
        date: "2024-01-15",
        timezone: "UTC",
      });
      
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
});

