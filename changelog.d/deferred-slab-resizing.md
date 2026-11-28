### Fixed

#### Mesh deferred slabs before solving between design resizing rounds (2026-11-28)

Sizing now prepares the same slab mesh as a manual solve and stops if a column footprint would discard cell-specific loads.
