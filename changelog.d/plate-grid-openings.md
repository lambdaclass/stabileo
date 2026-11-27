### Added
#### Exact grid divisions and rectangular plate openings (2026-11-27)

`PlateMeshSpec.divisions` now requests an exact `n × m` grid, with cell sizes
fitted to the plate's bounding box and the same conforming boundary treatment
as size-based grids. Rectangular openings can be added in the plate's own axes
through `addPlateRectOpening`; dimensions and axes are validated before the
plate is changed. Division counts participate in the mesh signature, so changing
them marks an existing mesh as stale. Existing saved models without divisions
keep their previous behavior.
