### Fixed

#### Certify both harmonic damping anchors and retain spectral checks without a residual (2026-11-10)

The metamorphic harness selects the two largest eligible inverse eigenvalues before checking their uncertainty, and accepts a single anchor only when the solver's single-mode fallback is confirmed. Forward spectra and inverse anchor selection are sorted explicitly; harmonic error budgets are unchanged by the sign of the excitation frequency. Harmonic dense certification observes the existing size ceiling and expresses its anchor cutoff as the reciprocal of the solver cutoff. Spectral clustering retains the existing relative-gap rule when a residual is unavailable and applies the additional Weyl test only to finite residuals. Negative tests now require static-translation-scale errors in antisymmetric singular-mass responses to fail. No production analysis results change.
