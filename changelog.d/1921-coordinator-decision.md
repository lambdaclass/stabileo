### Fixed
#### Refuse staged cables and respect contact tolerance (2026-11-11)

Both staged solvers refuse every cable with `cable_analysis_required`. The 2D Ernst
iteration exception is withdrawn because positive end forces and convergence do not
prove equilibrium with sag. Cable parity requires identical structured refusals; numeric
staged parity uses truss stays and linear references. Closed surface contact checks use
the configured tolerance scaled by stiffness, retaining refusal above that limit
(#417, #432; PR #1921). See the [results-change write-up](../docs/results-changes/2026-11-staged-cable-refusal-and-contact-tolerance.md).
