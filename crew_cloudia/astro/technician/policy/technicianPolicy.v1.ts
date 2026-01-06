/**
 * Technician Policy v1
 * 
 * Defines the deterministic rules for extracting astrological facts from sky_state.
 * This policy governs what constitutes a "fact" vs what is filtered out.
 */

export type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition";

export type BodyId =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto"
  | "north_node"
  | "south_node";

export interface OrbThresholds {
  /** Maximum orb (degrees) for primary salience */
  primary_max_deg: number;
  /** Maximum orb (degrees) for secondary salience */
  secondary_max_deg: number;
}

export interface FactKinds {
  /** Include aspect facts (transits) */
  aspect_facts: boolean;
  /** Include retrograde condition facts */
  retrograde_facts: boolean;
  /** Include sign ingress condition facts */
  ingress_facts: boolean;
  /** Include lunation condition facts */
  lunation_facts: boolean;
}

export interface TechnicianPolicyV1 {
  /** Policy version identifier (e.g., "tech_v1") */
  technician_policy_version: string;
  
  /** Supported aspect types that will be extracted */
  supported_aspect_types: AspectType[];
  
  /** Orb thresholds by aspect type for determining primary vs secondary salience */
  orb_thresholds: Record<AspectType, OrbThresholds>;
  
  /** Bodies that are included in fact extraction (required) */
  body_inclusion_required: BodyId[];
  
  /** Bodies that are optionally included (may be filtered by policy) */
  body_inclusion_optional: BodyId[];
  
  /** Which kinds of facts to extract */
  fact_kinds: FactKinds;
  
  /** Whether to include background aspects in background_conditions bucket */
  include_background_aspects: boolean;
}

export const TECHNICIAN_POLICY_V1: TechnicianPolicyV1 = {
  technician_policy_version: "tech_v1",
  
  supported_aspect_types: [
    "conjunction",
    "sextile",
    "square",
    "trine",
    "opposition",
  ],
  
  orb_thresholds: {
    conjunction: {
      primary_max_deg: 8.0,
      secondary_max_deg: 10.0,
    },
    sextile: {
      primary_max_deg: 6.0,
      secondary_max_deg: 8.0,
    },
    square: {
      primary_max_deg: 8.0,
      secondary_max_deg: 10.0,
    },
    trine: {
      primary_max_deg: 8.0,
      secondary_max_deg: 10.0,
    },
    opposition: {
      primary_max_deg: 8.0,
      secondary_max_deg: 10.0,
    },
  },
  
  body_inclusion_required: [
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
  ],
  
  body_inclusion_optional: [
    "north_node",
    "south_node",
  ],
  
  fact_kinds: {
    aspect_facts: true,
    retrograde_facts: true,
    ingress_facts: true,
    lunation_facts: true,
  },
  
  include_background_aspects: false,
};

