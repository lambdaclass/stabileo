### Changed
#### Reuse linear factorizations in the independent 3D feature-matrix reference (2026-11-09)

- Prepare each unconstrained model once for the position-by-position moving-load
  and influence-line references. Constrained models keep full independent linear
  solves. Every axle position, load, interior-force sample, and assertion remains.
  Engine results and the generated feature matrix are unchanged.
