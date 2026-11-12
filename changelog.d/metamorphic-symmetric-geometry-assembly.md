### Fixed

#### Construct exact metamorphic symmetry and budget load assembly rounding (2026-11-12)

The metamorphic harness centers each half-model on a zero axis before reflecting it, so paired coordinates and spans are exactly symmetric in floating point. Only nodes exactly on the axis are merged; nonfinite centered geometry is rejected. Reversal comparisons propagate a load assembly uncertainty derived from the existing operation budget and applied-action magnitudes through the reduced stiffness inverse. Absolute accuracy bounds apply only to their own response items. Relative comparison tolerances, limits, expected-failure baselines, and production engine results are unchanged. Exact nightly regressions cover #1970–#1976 and #1978–#1985; seeded sign, scale, and stiffness faults remain detectable in 2D and 3D. See `docs/verification/SYMMETRY_REVERSAL_BUDGET.md`.
