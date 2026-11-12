### Fixed

#### Nonlinear regression checks verify force and node coverage and angular units

- Require exact recovered element IDs before checking pure axial bending, compare WASM displacement node IDs including duplicates and omissions, and use the dimensionless force-times-length-squared over flexural-rigidity scale for supported rotations. Mutation controls cover missing force results, duplicate or missing nodes, and both sides of the rotation bound in 2D and 3D linear and nonlinear WASM solves (#1940).
