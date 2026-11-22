### Changed
#### Compile alternative nonlinear drivers as an opt-in engine feature (2026-11-22)

Enable the `experimental-nonlinear` Cargo feature and use
`solver::experimental_nonlinear` to select line search, Anderson acceleration,
adaptive load stepping, the shared 3D driver, or the shared arc-length and
displacement-control drivers. Feature-enabled WASM builds expose separate
`solve_experimental_*` exports. CI runs the feature-enabled native and WASM
driver tests.
