### Fixed

#### Preserve planar model input checks across imports and solves

Planar solver inputs refuse a node that supplies both `y` and `z`, including equal coordinates. Excel import writes a single transverse component for a planar nodal load. Project opens keep the version and format checks and report conflicting fields before replacing the current model.
