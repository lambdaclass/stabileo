### Fixed

#### Harmonic direct solves preserve accuracy on coupled systems (2026-11-10)

**BREAKING (results):** Dense and sparse harmonic direct solves now use exact binary column scaling and compensated residual refinement against the original dynamic system. This corrects rounding error introduced by column normalization on ill-conditioned coupled systems while retaining the existing resonance refusal. The independent harmonic regression reference now uses exact rational elimination; its assertions and tolerances are unchanged. The corrected #1434 truncation entry is retired from the active known-issues registry. See [the results-change write-up](../docs/results-changes/2026-11-harmonic-direct-refinement.md), #1539 and PR #1922.
