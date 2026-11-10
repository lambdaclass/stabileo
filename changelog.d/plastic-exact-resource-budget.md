### BREAKING (results)
#### Exact plastic certification refuses excessive LP construction work (2026-11-10)

The exact 2D/3D plastic candidate construction and the combined checked 3D API now refuse LPs whose conservative storage or initial pivot-work forecast exceeds the engine resource budget. This protects the separately reproduced browser-reachable grid-slab case (#743); the harness skip is not its only protection. The forecast comes from the actual equilibrium variables, section samples, polygon refinement and unchanged simplex iteration bound. This changes availability rather than a numerical collapse factor. Details: [results change](../docs/results-changes/2026-11-plastic-exact-resource-budget.md).
