### Fixed
#### 3D diagrams keep their shape far from the origin (2026-11-19)

A 3D force diagram stored its vertices as single-precision coordinates measured
from zero. On a model placed at survey coordinates (X = 500,000 m,
Y = 5,000,000 m) those hold 0.03 m in X and 0.5 m in Y, so a one-metre member's
diagram was drawn on that grid. A diagram's vertices, outlines, closing
segments, markers and value labels are now measured from the model's centre,
which the diagram group carries as its own position. The members, nodes and
loads of the 3D view are still measured from zero.
