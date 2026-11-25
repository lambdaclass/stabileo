### Fixed

#### Encode raw WASM inputs for the gravity-width reaction checks

The gravity-width checks encode omitted span bounds before running the linear and P-Delta solvers. (#2269)
