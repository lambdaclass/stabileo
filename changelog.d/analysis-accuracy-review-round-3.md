### Fixed

#### Cap pre-stress, moving-load recovery and trajectory certification independently (2026-11-10)

Buckling pre-stress and moving-load force recovery now apply the same independent static accuracy ceiling as PCG before their residuals can supply comparison allowances. Time-history certification caps trajectory defects using the model-derived comparison tolerance and load energy, independently of the candidate amplitude. Negative response scaling preserves floor magnitudes. Planted errors precede certification in regressions. The blog tests verify SA-2026-056 remains a pending draft in all six languages, including the existing Spanish and Portuguese rows. The duplicate #1370 corpus model and test entry were removed after checking that its published model is identical to #1369. No engine results, comparison tolerances or coverage baselines change.
