### Fixed

#### BREAKING (results): Use column shear spacing and provided tie geometry

CIRSOC 201-2025 column shear spacing now applies Table 10.7.6.5.2 only where shear reinforcement is required, retaining ordinary column tie rules otherwise. Rectangular and shaped columns share this gate, without the beam-only across-width limit. Rectangular column bar geometry and both shear depths use the provided tie diameter; a larger actual tie can reverse a previous strength pass. Recompute affected columns. Localize directional leg-distribution failures in every locale. The [results record](../docs/results-changes/2198-round16-column-ties.md) audits all eight prior refusals, the sole recovered member 185, and every changed flagship result (#2198).
