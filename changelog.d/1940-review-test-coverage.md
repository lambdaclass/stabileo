### Fixed

#### Nonlinear regression checks require completed comparisons and force results

- Require successful shell rotation, reflection and relabel comparisons, verify the prescribed arc length of continued point-spring solutions independently of equilibrium, and require exact element-force coverage before asserting zero bending in native and WASM tests. Negative controls reject unchanged continuation seeds, incorrect step lengths, skipped comparisons and missing force results (#1940).
