# Match combination envelope rows by entity ID (2026-11-17)

The 2D and 3D envelope kernels used the first result's entity labels and took extrema from the same array position in each subsequent result. They also used those positions when evaluating the member diagrams. With displacement rows `(nodeId: 2, ux: 1)` and `(nodeId: 9, ux: 4)` in two results, the 3D standalone and fused exports returned `(nodeId: 2, ux: 4)` without a diagnostic. The standalone kernels on `origin/main` at `cf9272470` have the same positional code. Within a 3D combination, rows outside the template's ID set were silently dropped.

Both dimensions now match displacement and reaction rows by node ID and member force rows by element ID before taking extrema or evaluating diagrams. Equal ID sets can arrive in any order. The first result determines output order and the existing tie rule still selects the first governing value. Missing, unexpected and duplicate IDs cause a refusal that names the result, the field and the ID. Single, batched and fused 3D superposition apply the same matching requirement before summing.

Re-run saved combination analyses if case records may have arrived in a different order or represented different node or element sets. The existing snapshot fixtures and comparison tolerances are unchanged.

The combination kernels also refuse an absent case result when any factor for that case is nonzero. Previously, a request for twice case 99 plus case 2 silently returned case 2 when its result was the only one supplied. A missing case with an exact zero factor is allowed. The refusal applies to native and WASM combination requests and names the case ID.
