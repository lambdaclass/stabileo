### Fixed
#### Preserve mesh-node ownership when remeshing adjacent plates (2026-11-19)

Remeshing plates with shared nodes and boundary members retains ownership of reused mesh nodes. Explicitly clearing a mesh transfers shared-node provenance to a remaining plate, so clearing and remeshing also avoids cell-count growth. Solver arithmetic and numerical safety limits are unchanged.
