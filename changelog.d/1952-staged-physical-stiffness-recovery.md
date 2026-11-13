### BREAKING (results)

#### Recover staged reactions from freshly assembled physical stiffness

Dense and sparse staged analyses in 2D and 3D now share one physical stiffness
recovery function. Its private matrix type prevents cached artificial
stabilization from entering constraint forces or support reactions. Physical
springs, cumulative loads and planar prestress remain included. Review saved
staged force results; see the [results-change write-up](../docs/results-changes/2026-11-staged-physical-stiffness-recovery.md) (#1952).
