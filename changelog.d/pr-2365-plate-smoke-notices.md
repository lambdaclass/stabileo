### Fixed

#### Plate meshing and recheck notice CI coverage (2026-11-20)

Plate meshing smoke tests use a small model whose neighboring meshes can stay current after a partial remesh. The production bundle check compares the lazy recheck notices against the published feature profile.
