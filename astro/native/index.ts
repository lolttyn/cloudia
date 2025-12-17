/**
 * Native ephemeris bindings (placeholder).
 *
 * This module will eventually load a compiled native addon.
 * For now, it exists only as a boundary placeholder.
 */

export interface NativeEphemerisConfig {
  ephemerisPath: string;
}

export function loadEphemeris(
  _config: NativeEphemerisConfig
): never {
  throw new Error(
    "Native ephemeris bindings are not implemented yet."
  );
}

