### Fixed

#### IFC wall meshing before analysis with unified PRO plates (2026-11-20)

Automatic meshing also meshes neighboring plates made stale during preparation, so the imported wall can keep its full base support and meet the slab node to node. Analysis still stops if the resulting meshes are incompatible or a neighboring plate has local shell loads that would be lost.
