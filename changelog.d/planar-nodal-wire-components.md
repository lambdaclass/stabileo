### BREAKING (results)

#### Refuse unsupported components in planar solver inputs

Native and direct WASM solvers refuse planar nodal records that would discard an out-of-plane load. Six-component records with zero out-of-plane padding preserve their in-plane load. See [the results change](../docs/results-changes/2026-11-planar-nodal-wire-components.md).
