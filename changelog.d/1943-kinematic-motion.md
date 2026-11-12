### Fixed
#### Kinematic mechanisms retain rigid-arm motion

- Report free rotations that move constrained translations as mechanisms in 2D and 3D. Preserve elastic conditioning refusals in plastic analysis and allow rigid-plastic limit analysis to normalize stiffness before solving. Scale dormant staged solve diagonals to active stiffness, require both WASM result node sets, assert loaded partial-constraint displacements, and run assertion regression tests in CI (#1846, #1943).
