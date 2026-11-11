### Fixed
#### Refuse negative node stiffness and skip linear re-checks without stiffness elements (2026-11-10)

Linear analysis checks each diagonal against the rounding of that entry before decomposing a node block. A much stiffer direction can no longer hide a negative diagonal and cause a negative rotation to be pinned away. Negative eigenvalues within the spectral rounding bound are refused unless the explicit member releases establish zero physical rotational stiffness; ordinary translation mechanisms retain their mechanism refusal. Release evidence follows constrained DOFs. No numerical tolerance or baseline changes.

The linear-stability re-check notice still covers every linear result, with members, shells, connectors or springs required to establish that a model has stiffness elements. Empty models have no linear result to re-check. See the final-review section of `docs/results-changes/2026-11-linear-stability-refusals.md` for the measured main comparison.
