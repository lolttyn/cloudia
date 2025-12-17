# Ephemeris implementation scan

Scanned for Swiss Ephemeris usage and legacy paths:

- `astro/native/` contained custom node-gyp addon (`binding.gyp`, `addon.cc`, `build/`, `load-test.mjs`, `index.ts`) and vendored C sources under `astro/native/swisseph/`.
- Vendored C sources referenced many Swiss Ephemeris entry points (`swe_calc_ut`, `swe_julday`, `SEFLG_*`).
- Build artifacts referenced `.node` outputs under `astro/native/build/Release/swisseph_native.node`.
- No other active imports of the native addon were found elsewhere in the repo.

Action from this PR: retire the custom native path in favor of the npm `swisseph` addon with `ephemeris/ephe/` as the canonical data directory.

