### Fixed

#### Keep harmonic certification conservative at zero load and usable below the damping cutoff (2026-11-10)

The metamorphic harness preserves an infinite error floor when zero forcing meets an unbounded numerical or modal-truncation estimate. Inverse-pencil modes wholly below the solver's positive-mode cutoff are excluded from damping-anchor selection while remaining in the resolvent bound; intervals touching or crossing the cutoff remain uncertifiable. Seeded resonance regressions now require actual passes, zero inconclusive outcomes, and a finite error budget. Ordinary harmonic invariance checks again exercise the public solver wrappers, restoring the engine lint coverage gate. No production analysis results change.
