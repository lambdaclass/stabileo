### Added

#### Soundness regression audit (2026-11-11)

Retain published time-history, harmonic, modal, PCG, moving-load and influence-line findings as active numerical regressions, and check the differential oracles against planted displacement, reaction and member-force errors in both dimensions and through both comparison entry points. A planted harmonic response also checks the original #994 model after identifying its oracle-floor calibration. The production health oracle is also checked against planted wrong results and invalid deployment responses. The audit records results drift, merge-path coverage and the closed-issue test inventory. Engine numerics and acceptance tolerances are unchanged.
