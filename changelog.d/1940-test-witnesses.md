### Fixed

#### Nonlinear regression witnesses reject fabricated answers

- Check the prescribed arc-length constraint alongside equilibrium in native and WASM regressions, reject zero and wrong-length paths, and share the native witness across both support-path checks. Validate displacement node coverage and expected signed components in linear and nonlinear CI cases. Export the complete CI corpus through one test so concurrent subset tests cannot replace it (#1940).
