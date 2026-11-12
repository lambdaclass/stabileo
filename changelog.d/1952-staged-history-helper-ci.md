### Fixed

#### Keep staged history assertions connected to WASM CI

Declare the staged history assertion helper as a dependency of the staged WASM regression target already run by CI, and check that its consumers and CI job remain connected (#1952).
