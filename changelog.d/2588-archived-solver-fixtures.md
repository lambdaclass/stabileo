### Fixed
#### Restore archived solver replays in CI (2026-11-26)

Shared test fixture loaders remove top-level archive metadata before decoding solver inputs. This restores the #1090 material replay and the harmonic and staged WASM controls that use its fixture.
