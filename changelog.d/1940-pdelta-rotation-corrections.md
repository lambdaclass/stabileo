### BREAKING (results)

#### P-Delta keeps converging after rigid rotation

- P-Delta updates 2D and 3D displacements with a compensated equilibrium-residual correction through one shared dense/sparse path. This prevents total-solution roundoff from causing false nonconvergence after rotation, including the DKT strip frame equivalent reported by seed `20261018`. Requested tolerances and iteration limits are unchanged. Re-run P-Delta analyses; convergence, displacements, forces and reactions may change. See [the results-change record](docs/results-changes/2026-11-pdelta-rotation-corrections.md).
