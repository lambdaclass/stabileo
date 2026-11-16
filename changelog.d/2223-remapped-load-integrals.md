### Fixed
#### BREAKING (results): Member-load remapping retains force and first moment (2026-11-16)

Planar Maxwell and plastic hinge splits preserve distributed-load resultants and first moments when child geometry differs by roundoff. A positive interval whose mapped endpoints coincide becomes an equivalent interior point force and residual couple; axial loads retain their first moment with an interior force pair. Independent applied-force totals use Neumaier compensated summation, retaining small nodal forces between cancelling large forces. Equilibrium summaries, acceptance, and planar plastic histories can change. No acceptance limit changed. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222, #2223).
