### Fixed
#### Verify beam–slab mesh connectivity and preview unsafe node merges (2026-11-27)

Physical-plate meshing detects short beam crossings and refuses meshes that lose a requested beam trace or fail to share its node IDs, rolling back the whole operation. Manual node merging previews conflicts and refuses support loss, collapsed connections and snaps beyond the tolerance. Solver arithmetic and numerical safety limits are unchanged.
