### BREAKING (results)

#### P-Delta preserves axial strain through cancellation

- Member geometric stiffness and geometric end-force recovery use the same compensated axial strain calculation in 2D and 3D. This prevents false P-Delta nonconvergence after rigid rotation without changing the requested tolerance. Re-run affected P-Delta analyses; convergence, displacements and member forces may change. Previously corrected #761, #1100 and #971 reproducers now run as active regressions with independent numerical controls. See [the results-change record](docs/results-changes/2026-11-pdelta-axial-strain.md).
