### Added

#### Invariance checks, slice 1: priority analyses and stiffness scaling (2026-10-31)

The metamorphic suite now runs strict geometric and superposition checks on the six priority analyses (linear, plastic collapse, time history, kinematic check, modal, buckling), with exact counts of the comparisons run so a dropped analysis fails, refusals accepted only when registered and in scope, and stricter validation of modal and spectral results. Four of them also check uniform stiffness scaling (every E times k): linear displacements and rotations scale by 1/k with reactions and forces unchanged, modal frequencies by √k, buckling factors by k, and plastic collapse factors stay unchanged. Test-only: no solver results change.
