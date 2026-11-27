### Fixed
#### Generated wind preserves interior diagram accuracy on strongly curved pressure bands (2026-11-27)

The wind generator can replace a gently varying pressure band with two linear member loads.
It bounds the cut-force error over each half before accepting the pair. A band without
a confirmed bound keeps the original per-load refinement. The cubic-grid and physical-apex cases retain their
analytic shear and bending moment checks. Interior forces can change on regenerating W and Wa.
Regenerate those cases and rerun dependent analyses and checks. [Results change](../docs/results-changes/2026-11-wind-two-part-moments.md)
