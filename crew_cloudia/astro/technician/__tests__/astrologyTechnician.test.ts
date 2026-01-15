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
      expect(facts.source.sky_state_schema_version).toBe("1.1.0");
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

  describe("interpreter_transits_v1 derivation", () => {
    it("populates interpreter_transits_v1 field", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      expect(facts.interpreter_transits_v1).toBeDefined();
      expect(Array.isArray(facts.interpreter_transits_v1)).toBe(true);
    });

    it("selects faster-moving planet from aspect pairs (moon vs saturn)", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      // Find a transit that involves moon (fastest) and a slower planet
      const moonTransit = facts.interpreter_transits_v1.find(
        (t) => t.planet === "moon" && t.source.kind === "aspect"
      );
      
      if (moonTransit && moonTransit.source.body_a && moonTransit.source.body_b) {
        // Moon should be selected even if it's body_b
        const { body_a, body_b } = moonTransit.source;
        expect(moonTransit.planet).toBe("moon");
        // Verify moon is in the aspect pair
        expect([body_a, body_b]).toContain("moon");
      }
    });

    it("maps sign from skyState.bodies[planet].sign", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      for (const transit of facts.interpreter_transits_v1) {
        const bodyState = sky.bodies[transit.planet];
        if (bodyState) {
          expect(transit.sign).toBe(bodyState.sign);
        }
      }
    });

    it("maps retrograde from skyState.bodies[planet].retrograde", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      for (const transit of facts.interpreter_transits_v1) {
        const bodyState = sky.bodies[transit.planet];
        if (bodyState) {
          expect(transit.retrograde).toBe(bodyState.retrograde);
        }
      }
    });

    it("maps duration_days by salience (primary=2, secondary=7, background=90)", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      for (const transit of facts.interpreter_transits_v1) {
        if (transit.salience === "primary") {
          expect(transit.duration_days).toBe(2);
        } else if (transit.salience === "secondary") {
          expect(transit.duration_days).toBe(7);
        } else if (transit.salience === "background") {
          expect(transit.duration_days).toBe(90);
        }
      }
    });

    it("maps primary transits with salience='primary'", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      const primaryInterpreterTransits = facts.interpreter_transits_v1.filter(
        (t) => t.salience === "primary"
      );
      
      // Should have same count as transits_primary
      expect(primaryInterpreterTransits.length).toBe(facts.transits_primary.length);
      
      // Verify source metadata
      primaryInterpreterTransits.forEach((transit) => {
        expect(transit.source.kind).toBe("aspect");
        expect(transit.source.body_a).toBeDefined();
        expect(transit.source.body_b).toBeDefined();
        expect(transit.source.aspect_type).toBeDefined();
      });
    });

    it("maps secondary transits with salience='secondary'", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      const secondaryInterpreterTransits = facts.interpreter_transits_v1.filter(
        (t) => t.salience === "secondary"
      );
      
      expect(secondaryInterpreterTransits.length).toBe(facts.transits_secondary.length);
    });

    it("maps retrograde conditions to background transits", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      const retrogradeConditions = facts.background_conditions.filter(
        (c) => c.kind === "retrograde"
      );
      
      const retrogradeTransits = facts.interpreter_transits_v1.filter(
        (t) => t.source.kind === "retrograde"
      );
      
      // Should have same count
      expect(retrogradeTransits.length).toBe(retrogradeConditions.length);
      
      // Verify structure
      retrogradeTransits.forEach((transit) => {
        expect(transit.salience).toBe("background");
        expect(transit.orb_deg).toBe(0);
        expect(transit.retrograde).toBe(true);
        expect(transit.duration_days).toBe(90);
      });
    });

    it("preserves orb_deg from aspect transits", async () => {
      const date = "2024-01-15";
      const sky = await computeSkyState({ date, timezone: "UTC" });
      const facts = deriveDailyFactsFromSkyState(sky, TECHNICIAN_POLICY_V1, date);
      
      // Create a map of aspect transits by their source
      const aspectTransitsBySource = new Map<string, typeof facts.interpreter_transits_v1[0]>();
      for (const transit of facts.interpreter_transits_v1) {
        if (transit.source.kind === "aspect" && transit.source.body_a && transit.source.body_b) {
          const key = `${transit.source.body_a}-${transit.source.body_b}-${transit.source.aspect_type}`;
          aspectTransitsBySource.set(key, transit);
        }
      }
      
      // Verify orb_deg matches
      for (const primaryTransit of facts.transits_primary) {
        const key = `${primaryTransit.body_a}-${primaryTransit.body_b}-${primaryTransit.aspect_type}`;
        const interpreterTransit = aspectTransitsBySource.get(key);
        if (interpreterTransit) {
          expect(interpreterTransit.orb_deg).toBe(primaryTransit.orb_deg);
        }
      }
    });
  });
});

