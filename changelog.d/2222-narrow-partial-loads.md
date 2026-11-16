### BREAKING (results)
#### Narrow partial member loads retain force and couple (2026-11-16)

Partial distributed loads shorter than the former kernel cutoff now use the concentrated-load limit in 2D and both 3D bending planes, including nonlinear analyses and recovered diagrams. Non-finite resultants are refused. Static force-balance checks integrate user-defined loads independently of element force assembly, so an omitted member load cannot make itself appear balanced. Rerun affected analyses and review reactions, member forces, deflections and dependent checks. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222).
