### Fixed

#### Check provided-cage test capacities against actual effective depth

Correct the line-end and planar provided-reinforcement test expectations left stale by the round-10 actual-cage depth correction. Both now use one cage-bound capacity oracle whose section input excludes nominal stirrup diameter. Add independent hand-calculated capacities for smaller, nominal and larger cages, retaining exact assertions. Engine calculations and results are unchanged; the [round-10 results record](../docs/results-changes/2198-round10-primary-depth.md) describes the governing geometry.
