### Fixed
#### Keep axial density notices scoped and pending until loads are repaired (2026-11-17)

The axial moment density notice now applies only to spatial frame projects with
nonzero distributed moment densities in global or projected load frames. It no
longer explains unrelated legacy displacements or member forces. A current solve
keeps the notice for stale generated and floor-definition loads until regeneration;
manual restoration remains independent (#2219).
