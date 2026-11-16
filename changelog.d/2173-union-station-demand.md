### Fixed
#### Preserve every combination in beam-line demand envelopes (2026-11-16)

- Evaluate each combination on the member's union station grid before taking flexure, shear and torsion maxima. Unequal station grids no longer drop a governing combination between its samples. Refuse stations without an unambiguous interpolation bracket; retain coverage validation before combination selection (#2096, PR #2173).
