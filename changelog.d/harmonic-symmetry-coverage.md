### Fixed

#### Preserve harmonic symmetry comparisons with finite error bounds (2026-11-10)

The metamorphic harness retains finite harmonic cancellation bounds and uses a stiffness-normalized inverse pencil when massless directions or eigenvalue conditioning prevent the forward certificate from bounding the result. Mass uses the solver's inclined support frames; modal responses include their energy residual bound. All twelve published harmonic/spectral regressions assert passes, including the five temporarily made inconclusive. Before/after sweeps cover 200 supported seeds per dimension plus the rich generator, with unchanged inconclusive fractions and planted-error rejection. No production analysis results change. See `docs/verification/HARMONIC_SPECTRAL_SYMMETRY.md` for the derivation and measurements.
