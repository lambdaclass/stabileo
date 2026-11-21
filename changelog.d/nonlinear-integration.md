### Changed
#### Keep alternative nonlinear drivers opt-in (2026-11-21)

The default build keeps the existing nonlinear solver implementations. To
build or test the integrated Newton line search, Anderson acceleration,
adaptive load stepping and shared continuation drivers, run
`make engine.nonlinear-opt-in` and use the ordinary engine or WASM Make targets
in the checkout printed by that command. The checkout is created from the
current commit. The experimental sources receive their own signed commit so
WASM results carry the build’s actual source provenance. Preparation fails if
any solver file the patch modifies has changed since the integration.
