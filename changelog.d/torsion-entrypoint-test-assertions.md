### Changed
#### Torsion regression tests require each verification entry point to return its result (2026-11-15)

The section-boundary and zero-secondary-shear regressions now require torsion results from direct, prepared and concurrent verification. Only the standalone torsion entry invokes the torsion checker directly, so a missing wrapper result fails instead of being replaced by a passing fallback (PR #2169, #2142).
