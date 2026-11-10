### Fixed

#### Preserve harmonic and small-cluster nightly regression coverage together (2026-11-10)

The PR #1887 merge with main retains both the harmonic and spectral symmetry regressions and PR #1894's effective-mass, shell-stress and unresolved-case regressions. All held cells, assertions, tolerances and existing ignore attributes are preserved. This merge changes verification coverage only; production engine results are unchanged.
