### Added

#### Invariance checks, slice 1: stiffness scaling across every analysis (2026-10-31)

The metamorphic suite now checks that scaling every stiffness by k scales displacements by 1/k (and leaves forces, buckling factors and collapse factors as the physics requires) in every analysis it covers, with exact counts of the comparisons run so a dropped analysis fails, refusals accepted only when registered and in scope, and stricter validation of modal and spectral results. Test-only: no solver results change.
