### BREAKING (results)

#### P-Delta and SSI preserve equilibrium through cancellation

- Share compensated dense and sparse residual evaluation and bounded Cholesky refinement. Renumbered P-Delta shell models and constrained SSI frames can meet their original strict convergence limits. Reduce structural and soil stiffness separately before combining them in the shared SSI secant system.
- Keep the rigid-pile hand calculation and the original finite-stiffness pile as separate positive and unresolved-equilibrium controls, with unchanged numerical bounds. Re-run affected P-Delta and SSI analyses (#761, PR #1940). See [the results-change record](docs/results-changes/2026-11-nonlinear-equilibrium-arithmetic.md).
