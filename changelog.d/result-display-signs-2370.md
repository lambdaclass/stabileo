### Fixed
#### Reaction moments and load directions in result displays (2026-11-20)

The Basic 3D Reactions table uses the solver's global moment signs. Global free-body inspection expresses spatial end moments in global axes, and signed planar node-side labels follow the directions of their arrows. Reports resolve the axial part of a global planar point load along the member before printing its global force components. The Basic and PRO reports use the solver’s plane when naming these force components in spatial models. Both reports use the solver’s spatial moment vector for legacy point couples, including the negative Y sign in XZ embeddings and the Z axis in native XY models.
