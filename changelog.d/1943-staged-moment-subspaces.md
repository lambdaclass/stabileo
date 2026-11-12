### Fixed
#### Staged moment history and kinematic rotation subspaces

- Refuse accumulated nodal moments when a later stage removes their rotational restraint. Count independent rigid-arm translation motions, retaining harmless rotation combinations. Treat every positive support spring as a restraint for kinematic rank while preserving elastic solve conditioning checks (#1846, #1943).
