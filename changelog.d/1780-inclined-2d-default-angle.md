### Fixed

#### Omitted 2D inclined-support angles use zero consistently (2026-11-09)

A 2D inclined roller with an omitted angle and a positive global Y spring now solves like the same support with explicit zero. Dense and sparse assembly, constraint frames and reaction recovery use the same zero-angle frame; already solved omitted-angle inputs may change final floating-point digits. Exact result regressions cover linear, P-Delta, sparse and constrained paths with settlements. Ordinary rigid support and spring conflicts remain refused. The previously refused input had no saved result, and final-digit rounding changes do not warrant a saved-result recheck notice.

