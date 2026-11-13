### Fixed

#### Verify redundant-restraint admission and execute 2D P-Delta regressions (#2075)

Replace an obsolete rounding-refusal expectation for a tie between already fixed nodes with exact-rank evidence and an independent high-precision displacement oracle. Native dense/sparse and public WASM constrained checks cover both dimensions. Fix the WASM runner's shadowed dimension so admitted and refused 2D P-Delta cases execute, and require successful P-Delta coverage in both dimensions. `IGNORED=1` now retains the six unignored constrained-release regressions. Engine code, refusal limits and existing tolerances are unchanged. See [the results-change audit](../docs/results-changes/2026-11-constraint-rounding.md#review-audit-redundant-fixed-node-constraints-2075).
