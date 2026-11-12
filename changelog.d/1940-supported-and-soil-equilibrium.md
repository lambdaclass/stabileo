### BREAKING (results)

#### Nonlinear supports, yielding and soil springs require admissible equilibrium

- Restrained reactions cannot mask a free residual. Support-only increments use physical support-to-free coupling, and material Newton steps apply settlements before accepting convergence. Model length uses the geometric centroid; valid point springs and coincident connectors retain their answers. P-Delta includes prescribed displacement scales and the spatial warping seed.
- Path following rejects reference loads eliminated by constraints. Nonlinear SSI checks relative stiffness changes and equilibrium with the updated soil curves. Positive material capacities are no longer ignored below an absolute force floor. Re-run affected nonlinear and SSI analyses (#761, PR #1940). See [the results-change record](docs/results-changes/2026-11-supported-and-soil-equilibrium.md).
