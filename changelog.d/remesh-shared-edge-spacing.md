### Fixed
#### Preserve shared-edge connectivity when changing a plate's target mesh size (2026-11-19)

A replacement mesh honors boundary nodes still used by neighboring shells, including nodes originally created by the plate being remeshed. Changing several plates' settings releases their old meshes together, allowing shared edges to coarsen. Mesh status tracks shared-edge constraints and required nodes. Rejected replacements restore the original model; replacements also reject nonconforming boundaries. Solver arithmetic and numerical safety limits are unchanged.
