### Fixed

#### Preserve rigid-link restore coverage after remeshing the gallery (#2409)

The restore regression tests now save, restore and solve a dedicated model with a load-bearing rigid link whose stored DOF list is absent. The seven-storey gallery still exercises project restoration and diaphragm migration.
