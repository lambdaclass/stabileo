### Fixed

#### BREAKING (results): recover plastic balance by model IDs and certify frames within actual storage limits (2026-11-11)

Resolve recovered member and node IDs from the same model used by the solve, independently of JSON object keys. An absent recovered member returns the existing conditioning error as a coded refusal instead of panicking. Exact 2D and 3D plastic certificates check the initial model and each actual LP candidate against the unchanged storage limits; an oversized optional refinement retains earlier exact bounds. This restores certification of provable random 3D frames without changing numerical tolerances. See `docs/results-changes/2026-11-plastic-nightly-model-and-candidate-budgets.md` and issues #1953 and #1954.
