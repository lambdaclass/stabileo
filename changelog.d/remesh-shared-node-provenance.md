### Fixed
#### Preserve mesh-node ownership when remeshing adjacent plates (2026-11-19)

Remeshing plates with shared nodes and boundary members retains ownership of reused mesh nodes. Repeating the same mesh no longer inflates the cell count or unnecessarily marks neighboring plates stale. Meshing guards and solver arithmetic are unchanged.
