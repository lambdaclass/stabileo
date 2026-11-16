### Fixed
#### Spatial unloaded-shape test uses the required force record (2026-11-15)

The 3D deformed-shape test now supplies forces from the same model solved without loads to match the required API signature. The loaded recovery refusal and unloaded zero-displacement assertions are unchanged, restoring the web typecheck without changing engine results (#2143, PR #2170).
