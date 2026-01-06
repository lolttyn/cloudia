/**
 * Layer 1 — Astrology Technician
 * 
 * Transforms Layer 0 sky_state into Layer 1 daily_facts.
 * Applies policy-driven filtering and classification.
 */

import { computeSkyState } from "../../../astro/computeSkyState.js";
import { getSkyStateRange } from "../ephemeris/persistence/getSkyStateRange.js";
import { TECHNICIAN_POLICY_V1, type AspectType, type BodyId, type TechnicianPolicyV1 } from "./policy/technicianPolicy.v1.js";
import {
  DailyFactsSchema,
  type DailyFacts,
  type TransitFact,
  type ConditionFact,
  type ExcludedRecord,
  type InterpreterTransit,
  type InterpreterTransitSource,
} from "./schema/dailyFacts.schema.js";
import type { SkyState, Aspect } from "../../../astro/schemas/skyState.schema.js";
import type { BodyId } from "./policy/technicianPolicy.v1.js";

export interface AstrologyTechnicianInput {
  date: string; // YYYY-MM-DD
  timezone: "UTC";
}

/**
 * Primary exact threshold for determining is_exact flag
 * (Not yet in policy, using default per docs)
 */
const PRIMARY_EXACT_THRESHOLD_DEG = 1.0;

/**
 * Deterministic body speed order for planet selection from aspect pairs.
 * Faster-moving bodies come first. Used to select "primary" planet from (body_a, body_b).
 * This is a normalization rule, not interpretive meaning.
 */
const BODY_SPEED_ORDER: Record<BodyId, number> = {
  moon: 1,
  mercury: 2,
  venus: 3,
  sun: 4,
  mars: 5,
  jupiter: 6,
  saturn: 7,
  uranus: 8,
  neptune: 9,
  pluto: 10,
  north_node: 11,
  south_node: 12,
};

/**
 * Deterministic duration_days mapping by salience.
 * Matches legacy fixture pattern (primary→2, secondary→7, background→90).
 * This is a pinned rule, not a heuristic.
 */
const DURATION_DAYS_BY_SALIENCE: Record<"primary" | "secondary" | "background", number> = {
  primary: 2,
  secondary: 7,
  background: 90,
};

/**
 * Select primary planet from aspect pair using deterministic speed order.
 * Faster-moving body wins; tiebreak to body_a.
 */
function selectPrimaryPlanet(bodyA: BodyId, bodyB: BodyId): BodyId {
  const speedA = BODY_SPEED_ORDER[bodyA] ?? 99;
  const speedB = BODY_SPEED_ORDER[bodyB] ?? 99;
  
  if (speedA < speedB) {
    return bodyA;
  } else if (speedB < speedA) {
    return bodyB;
  } else {
    // Tiebreak to body_a
    return bodyA;
  }
}

/**
 * Map sky_state body name to BodyId (handles case normalization)
 */
function normalizeBodyId(bodyName: string): BodyId | null {
  const lower = bodyName.toLowerCase();
  const validBodies: BodyId[] = [
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
    "north_node",
    "south_node",
  ];
  
  if (validBodies.includes(lower as BodyId)) {
    return lower as BodyId;
  }
  return null;
}

/**
 * Check if a body is included in the policy
 */
function isBodyIncluded(bodyName: string, policy: typeof TECHNICIAN_POLICY_V1): boolean {
  const bodyId = normalizeBodyId(bodyName);
  if (!bodyId) return false;
  
  return (
    policy.body_inclusion_required.includes(bodyId) ||
    policy.body_inclusion_optional.includes(bodyId)
  );
}

/**
 * Check if an aspect type is supported
 */
function isAspectSupported(aspectType: string, policy: typeof TECHNICIAN_POLICY_V1): boolean {
  return policy.supported_aspect_types.includes(aspectType as AspectType);
}

/**
 * Classify an aspect into primary/secondary/background based on orb
 */
function classifyAspect(
  aspect: Aspect,
  policy: typeof TECHNICIAN_POLICY_V1
): "primary" | "secondary" | "background" | "excluded" {
  const aspectType = aspect.type as AspectType;
  
  if (!isAspectSupported(aspect.type, policy)) {
    return "excluded";
  }
  
  const thresholds = policy.orb_thresholds[aspectType];
  if (!thresholds) {
    return "excluded";
  }
  
  if (aspect.orb_deg <= thresholds.primary_max_deg) {
    return "primary";
  } else if (aspect.orb_deg <= thresholds.secondary_max_deg) {
    return "secondary";
  } else if (policy.include_background_aspects) {
    return "background";
  } else {
    return "excluded";
  }
}

/**
 * Convert sky_state aspect to TransitFact
 */
function aspectToTransitFact(aspect: Aspect): TransitFact | null {
  const bodyA = normalizeBodyId(aspect.body_a);
  const bodyB = normalizeBodyId(aspect.body_b);
  
  if (!bodyA || !bodyB) {
    return null;
  }
  
  return {
    body_a: bodyA,
    body_b: bodyB,
    aspect_type: aspect.type as AspectType,
    orb_deg: aspect.orb_deg,
    is_exact: aspect.orb_deg <= PRIMARY_EXACT_THRESHOLD_DEG,
  };
}

/**
 * Extract transits from sky_state aspects
 */
function extractTransits(
  skyState: SkyState,
  policy: typeof TECHNICIAN_POLICY_V1
): {
  primary: TransitFact[];
  secondary: TransitFact[];
  background: TransitFact[];
  excluded: ExcludedRecord[];
} {
  const primary: TransitFact[] = [];
  const secondary: TransitFact[] = [];
  const background: TransitFact[] = [];
  const excluded: ExcludedRecord[] = [];
  
  if (!policy.fact_kinds.aspect_facts) {
    return { primary, secondary, background, excluded };
  }
  
  for (const aspect of skyState.aspects) {
    // Check if both bodies are included
    const bodyAIncluded = isBodyIncluded(aspect.body_a, policy);
    const bodyBIncluded = isBodyIncluded(aspect.body_b, policy);
    
    if (!bodyAIncluded || !bodyBIncluded) {
      excluded.push({
        category: "body_not_included",
        reason: `Body not in inclusion list: ${aspect.body_a} or ${aspect.body_b}`,
        context: {
          body_a: aspect.body_a,
          body_b: aspect.body_b,
        },
      });
      continue;
    }
    
    const classification = classifyAspect(aspect, policy);
    
    if (classification === "excluded") {
      if (!isAspectSupported(aspect.type, policy)) {
        excluded.push({
          category: "unsupported_aspect_type",
          reason: `Aspect type '${aspect.type}' not in supported_aspect_types`,
          context: {
            aspect_type: aspect.type,
            body_a: aspect.body_a,
            body_b: aspect.body_b,
          },
        });
      } else {
        excluded.push({
          category: "orb_too_large",
          reason: `Aspect orb (${aspect.orb_deg}°) exceeds secondary max threshold and background aspects not included`,
          context: {
            body_a: aspect.body_a,
            body_b: aspect.body_b,
            aspect_type: aspect.type,
            orb_deg: aspect.orb_deg,
          },
        });
      }
      continue;
    }
    
    const transitFact = aspectToTransitFact(aspect);
    if (!transitFact) {
      excluded.push({
        category: "invalid_body_id",
        reason: `Could not normalize body IDs: ${aspect.body_a}, ${aspect.body_b}`,
        context: {
          body_a: aspect.body_a,
          body_b: aspect.body_b,
        },
      });
      continue;
    }
    
    if (classification === "primary") {
      primary.push(transitFact);
    } else if (classification === "secondary") {
      secondary.push(transitFact);
    } else if (classification === "background") {
      background.push(transitFact);
    }
  }
  
  return { primary, secondary, background, excluded };
}

/**
 * Extract background conditions from sky_state
 */
function extractBackgroundConditions(
  skyState: SkyState,
  policy: typeof TECHNICIAN_POLICY_V1
): {
  conditions: ConditionFact[];
  excluded: ExcludedRecord[];
} {
  const conditions: ConditionFact[] = [];
  const excluded: ExcludedRecord[] = [];
  
  // Lunation condition (always include if enabled)
  if (policy.fact_kinds.lunation_facts) {
    const moonBody = skyState.bodies.moon;
    if (moonBody) {
      conditions.push({
        kind: "lunation",
        phase: skyState.lunar.phase_name,
        sign: moonBody.sign as any, // moon's sign
      });
    }
  }
  
  // Retrograde conditions
  if (policy.fact_kinds.retrograde_facts) {
    for (const [bodyName, bodyState] of Object.entries(skyState.bodies)) {
      if (bodyState.retrograde) {
        const bodyId = normalizeBodyId(bodyName);
        if (bodyId && isBodyIncluded(bodyName, policy)) {
          conditions.push({
            kind: "retrograde",
            body: bodyId,
          });
        }
      }
    }
  }
  
  // Ingress conditions (not implemented in v1)
  if (policy.fact_kinds.ingress_facts) {
    excluded.push({
      category: "fact_kind_disabled",
      reason: "ingress_detection_not_implemented_v1",
      context: {},
    });
  }
  
  return { conditions, excluded };
}

/**
 * Derive interpreter_transits_v1 from existing facts + skyState.
 * This is a pure, deterministic mapping with no heuristics.
 */
function deriveInterpreterTransits(
  transitsPrimary: TransitFact[],
  transitsSecondary: TransitFact[],
  backgroundConditions: ConditionFact[],
  skyState: SkyState
): InterpreterTransit[] {
  const result: InterpreterTransit[] = [];

  // Map primary transits
  for (const transit of transitsPrimary) {
    const planet = selectPrimaryPlanet(transit.body_a, transit.body_b);
    const bodyState = skyState.bodies[planet];
    
    if (!bodyState) {
      // Skip if body not in sky_state (shouldn't happen, but defensive)
      continue;
    }

    result.push({
      planet,
      sign: bodyState.sign as any,
      salience: "primary",
      orb_deg: transit.orb_deg,
      duration_days: DURATION_DAYS_BY_SALIENCE.primary,
      retrograde: bodyState.retrograde,
      source: {
        kind: "aspect",
        body_a: transit.body_a,
        body_b: transit.body_b,
        aspect_type: transit.aspect_type,
      },
    });
  }

  // Map secondary transits
  for (const transit of transitsSecondary) {
    const planet = selectPrimaryPlanet(transit.body_a, transit.body_b);
    const bodyState = skyState.bodies[planet];
    
    if (!bodyState) {
      continue;
    }

    result.push({
      planet,
      sign: bodyState.sign as any,
      salience: "secondary",
      orb_deg: transit.orb_deg,
      duration_days: DURATION_DAYS_BY_SALIENCE.secondary,
      retrograde: bodyState.retrograde,
      source: {
        kind: "aspect",
        body_a: transit.body_a,
        body_b: transit.body_b,
        aspect_type: transit.aspect_type,
      },
    });
  }

  // Map background conditions
  for (const condition of backgroundConditions) {
    if (condition.kind === "retrograde") {
      const bodyState = skyState.bodies[condition.body];
      if (!bodyState) {
        continue;
      }

      result.push({
        planet: condition.body,
        sign: bodyState.sign as any,
        salience: "background",
        orb_deg: 0, // Retrograde is a state, not an aspect
        duration_days: DURATION_DAYS_BY_SALIENCE.background,
        retrograde: true,
        source: {
          kind: "retrograde",
        },
      });
    } else if (condition.kind === "ingress") {
      const bodyState = skyState.bodies[condition.body];
      if (!bodyState) {
        continue;
      }

      // Use to_sign as the current sign (ingress just happened)
      result.push({
        planet: condition.body,
        sign: condition.to_sign,
        salience: "background",
        orb_deg: 0,
        duration_days: DURATION_DAYS_BY_SALIENCE.background,
        retrograde: bodyState.retrograde,
        source: {
          kind: "ingress",
        },
      });
    } else if (condition.kind === "lunation") {
      // Lunation doesn't map to a single planet transit
      // Skip for now - legacy interpreter may handle separately
      // If needed, we can add moon-based transit entry here
    } else if (condition.kind === "aspect") {
      // Background aspect - treat like primary/secondary but with background salience
      const planet = selectPrimaryPlanet(condition.body_a, condition.body_b);
      const bodyState = skyState.bodies[planet];
      
      if (!bodyState) {
        continue;
      }

      result.push({
        planet,
        sign: bodyState.sign as any,
        salience: "background",
        orb_deg: condition.orb_deg,
        duration_days: DURATION_DAYS_BY_SALIENCE.background,
        retrograde: bodyState.retrograde,
        source: {
          kind: "aspect",
          body_a: condition.body_a,
          body_b: condition.body_b,
          aspect_type: condition.aspect_type,
        },
      });
    }
  }

  return result;
}

/**
 * Pure function: Derive daily facts from a sky_state
 * This is deterministic and does not depend on external state.
 * 
 * @param skyState - The sky_state to derive facts from
 * @param policy - The technician policy to apply
 * @param date - The date for the facts (YYYY-MM-DD) - must match skyState.timestamp.date
 * @returns DailyFacts object (validated)
 */
export function deriveDailyFactsFromSkyState(
  skyState: SkyState,
  policy: TechnicianPolicyV1,
  date: string
): DailyFacts {
  // Hard requirement: facts must be derived from persisted sky_state
  // Assert that date matches sky_state.timestamp.date to catch accidental mismatch wiring
  if (date !== skyState.timestamp.date) {
    throw new Error(
      `Date mismatch: provided date "${date}" does not match sky_state.timestamp.date "${skyState.timestamp.date}". Facts must be derived from the correct sky_state row.`
    );
  }

  // Extract transits
  const transits = extractTransits(skyState, policy);
  
  // Extract background conditions
  const background = extractBackgroundConditions(skyState, policy);
  
  // Add background aspects to background conditions if needed
  const backgroundConditions: ConditionFact[] = [...background.conditions];
  
  if (policy.include_background_aspects) {
    for (const aspect of transits.background) {
      backgroundConditions.push({
        kind: "aspect",
        body_a: aspect.body_a,
        body_b: aspect.body_b,
        aspect_type: aspect.aspect_type,
        orb_deg: aspect.orb_deg,
      });
    }
  }
  
  // Combine all excluded records
  const excluded: ExcludedRecord[] = [
    ...transits.excluded,
    ...background.excluded,
  ];
  
  // Build source reference
  const source = {
    sky_state_schema_version: skyState.schema_version,
    engine: skyState.meta.engine,
    engine_version: skyState.meta.engine_version,
    ephemeris_fileset: skyState.meta.ephemeris_fileset,
  };
  
  // Derive interpreter_transits_v1 (deterministic compatibility view)
  const interpreterTransits = deriveInterpreterTransits(
    transits.primary,
    transits.secondary,
    backgroundConditions,
    skyState
  );

  // Build daily facts object
  const dailyFacts = {
    schema_version: "1.0.0",
    technician_policy_version: policy.technician_policy_version,
    date,
    timestamp_generated: new Date().toISOString(),
    source,
    transits_primary: transits.primary,
    transits_secondary: transits.secondary,
    background_conditions: backgroundConditions,
    excluded,
    interpreter_transits_v1: interpreterTransits,
  };
  
  // Validate against schema
  return DailyFactsSchema.parse(dailyFacts);
}

/**
 * Main function: Compute daily facts from sky_state
 * 
 * This function now uses persisted sky_state_daily for reproducibility.
 * It will load sky_state from the database (computing if missing in compute_on_miss mode),
 * then derive facts from that persisted sky_state.
 */
export async function astrologyTechnician(
  input: AstrologyTechnicianInput
): Promise<DailyFacts> {
  // Load sky_state from persisted cache (or compute if missing)
  // This ensures facts are pinned to a known sky_state row (and therefore known fileset/version)
  const skyStates = await getSkyStateRange(
    input.date,
    input.date,
    "compute_on_miss"
  );
  
  const skyState = skyStates[input.date];
  if (!skyState) {
    throw new Error(
      `Failed to load or compute sky_state for ${input.date}`
    );
  }
  
  const policy = TECHNICIAN_POLICY_V1;
  
  // Derive facts from persisted sky_state
  return deriveDailyFactsFromSkyState(skyState, policy, input.date);
}

