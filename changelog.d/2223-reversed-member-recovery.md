### Fixed
#### BREAKING (results): Unsupported recovery intervals are refused (2026-11-16)

Shared planar and spatial member recovery refuses reversed, zero-width and sub-limit distributed intervals. Saved force diagrams and deformed-shape exports apply the same interval rule. Standalone recovery errors identify the interval even when no member id is supplied. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222, #2223).
