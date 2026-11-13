### BREAKING (results)

#### Preserve compatible loads on released rotations across frames and units

Loads with zero virtual work on a released rotation can now solve after a rigid rotation or unit conversion (#2023, #2035, #2036, #2039, #2058, #2064, #2066, #2067). The shared compatibility and pin checks carry direction and load-assembly uncertainty. Genuine unsupported moments above the derived rounding bound still refuse. Empty-foundation Winkler and contact analyses without contact features now use the ordinary linear solver and its refusal checks. Nonlinear initial-moment gates use the same bounded work check. Existing conditioning and response warnings remain applicable. See [the results-change record](../docs/results-changes/2026-11-released-load-work.md).
