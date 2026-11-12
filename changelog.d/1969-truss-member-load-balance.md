### BREAKING (results)

#### Include transverse truss actions in conditional member balance (#1969, 2026-11-12)

Conditional balance checks now include the transverse end actions of truss member loads alongside their recovered axial forces. Load assembly and balance share the same transfer law in 2D and 3D. This allows the retained distributed-load witness and its XZ embedding to solve where the equivalent nodal models already solved, including native and WASM calls and nonlinear initialization. Distributed and point frame loads, genuine imbalance refusals, and the existing accuracy limits are retained. See [the results-change note](../docs/results-changes/2026-11-truss-member-load-balance.md).
