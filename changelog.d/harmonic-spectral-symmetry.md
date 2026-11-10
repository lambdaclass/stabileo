### Fixed

#### Bound dynamic symmetry comparisons with eigen residuals and resonance amplification (2026-11-10)

The metamorphic harness derives harmonic cancellation floors from the assembled stiffness and mass pencil, its eigen residual and modal basis conditioning, Rayleigh damping uncertainty, and the harmonic resolvent. Uncertifiable comparisons are inconclusive, and ordinary response ratios retain their existing tolerance. Spectral mode selection keeps modes whose eigenvalue error intervals overlap across the truncation boundary; peak responses continue to compare pair magnitudes. Twelve published seeds, resonance sweeps, and planted physical-scale errors are regressions. No production analysis results change. See `docs/verification/HARMONIC_SPECTRAL_SYMMETRY.md` for the replay table and derivation.
