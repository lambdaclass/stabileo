### BREAKING (results)

#### Refuse damping whose anchor frequencies cannot be computed

Time history and the direct harmonic path anchor Rayleigh damping on the model's first two natural frequencies. When those could not be computed they applied, without warning, an estimate from the matrix diagonals: on one nightly model six times the mass-proportional damping and a response 7.9 % smaller. Such an analysis is now refused with `DAMPING-ANCHOR-UNRESOLVED`; an analysis whose frequencies are computed keeps its numbers. See [the damping anchor results change](../docs/results-changes/2026-11-rayleigh-anchor-unresolved.md). (#2664)
