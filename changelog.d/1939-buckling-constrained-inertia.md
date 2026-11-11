### BREAKING (results)

#### Keep constrained sparse buckling completeness on the original pencil (#1939)

Constrained sparse buckling now counts modes from compensated original-pencil shifts, using the same constraint transform as factor refinement. Adding independent columns with higher factors no longer causes a valid constrained mode to be refused above the dense cutoff. Inertia resolution, convergence checks and tolerances are unchanged. The saved-results notice requires a recorded buckling run, including for trusses, frames, shells, curved shells and connectors. See [the results-change evidence](../docs/results-changes/2026-11-buckling-original-pencil.md).
