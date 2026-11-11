### Added

#### Direct harmonic residual refusal coverage (2026-11-11)

Add negative tests on both dense and sparse direct paths for excessive component residuals, dilution by an independent large load, and nonzero residuals in a zero-load component. The cases pass factorization and require the convergence refusal. A test-only response perturbation exercises the zero-load guard. Disabling the convergence check makes all six tests fail. No engine results change. PR #1922.
