### BREAKING (results)

#### Preserve planar nodal loads written as six-component vectors

Project intake accepts a complete nodal vector when its out-of-plane components are zero. It keeps the in-plane force and moment, and refuses a vector that would discard an out-of-plane load. See [the results change](../docs/results-changes/2026-11-planar-nodal-vectors.md).
