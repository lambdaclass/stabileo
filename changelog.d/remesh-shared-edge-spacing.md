### Fixed
#### Preserve shared-edge connectivity when changing a plate's target mesh size (2026-11-19)

A replacement mesh honors boundary nodes still used by neighboring shells, including nodes originally created by the plate being remeshed. Shared edges retain their spacing while unconstrained directions can refine or coarsen, without marking unchanged neighboring meshes stale. Solver arithmetic and meshing safety limits are unchanged.
