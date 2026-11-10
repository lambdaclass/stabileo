### Fixed
#### Staged cable parity checks tension and preserves compression refusal (2026-11-10)

The dense/sparse staged cable comparison now anchors the pylon top and requires positive tension at both ends of every stay, retaining its existing parity tolerance. The original compressive fixture is refused identically on both paths. A limited 2D staged path permits nodal loading in the final stage after unloaded construction, with converged cable iteration and verified tension; unsupported histories and non-tensile states remain refused. Other cable analysis restrictions are unchanged (#417, PR #1921).

The earlier superseded surface-validation registry link now matches its renamed document heading.
