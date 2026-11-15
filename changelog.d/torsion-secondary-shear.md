### BREAKING (results)
#### CIRSOC 201 torsion section limits include both concurrent shear axes (2026-11-15)

The solid-section shear–torsion limit now checks both orientations from the complete concurrent demand, for beams, columns and walls in both supported editions. The provided-beam verifier also checks torsion when primary shear is zero or stirrups are absent; non-negligible torsion without stirrups explicitly fails. Previously accepted sections can fail; additional stirrups cannot repair an exceeded concrete-section limit. Re-run saved concrete member designs and review section failures. See the [results-change record](../docs/results-changes/2026-11-torsion-secondary-shear.md) and [SA-2026-069](../docs/advisories/SA-2026-069-torsion-secondary-shear.md) (#2142, PR #2169).
