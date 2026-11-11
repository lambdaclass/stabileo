### BREAKING (results)

#### Inclined supports preserve small resolved loads

- Inclined load projection now compensates product and summation errors in linear and nonlinear analyses. Nonlinear equilibrium checks retain every free residual; a large restrained load cannot erase a representable tangential response. Fiber corrections and their final audit project applied and internal forces before subtraction. Spatial corotational analysis evaluates infinitesimal deformations directly from displacement increments. Re-run affected inclined-support analyses (#761, PR #1940). See [the results-change record](docs/results-changes/2026-11-inclined-load-projection.md).
- Limit the nonlinear convergence notice to models with members and nonlinear or P-Delta analysis history. Legacy stamps with unknown nonlinear history remain covered; empty and connector-only models do not receive that notice.
