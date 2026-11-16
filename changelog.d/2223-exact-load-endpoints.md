### BREAKING (results)
#### Exact member endpoints retain collapsed load contributions

Very narrow partial member loads now contribute to shear and moment diagrams at the exact member endpoint in 2D and both 3D bending planes. Empty or reversed recovered intervals no longer panic. Independent applied-force checks preserve the existing wrench-balance verdict while evaluating their own force imbalance. Provenance scopes numerical corrections to point or partial member loads and records equilibrium-summary changes separately. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222, #2223).
