### BREAKING (results)

#### Linear pin checks retain small couplings

Linear analysis now refuses indirect loading of an unresolved rotation even when its stiffness coupling falls below the spectral rounding filter. Earlier revisions of #1753 could return materially wrong rotations, including a wrong sign. Only explicit release information permits complete removal of a coupling within projection rounding. Spectral thresholds and pin-check tolerances are unchanged. See [the results-change evidence](../docs/results-changes/2026-11-linear-pin-coupling.md) (#1931).
