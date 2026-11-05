### Added
#### Benchmark gate: every benchmark has a spec, two references and a justified tolerance (2026-11-05)

`engine/tests/benchmarks/registry.json` records, for every benchmark, the quantity checked, its
references with citation, location and units, a justified tolerance and whether the references
are independent of the implementation's derivation. `make lint.engine` fails when a benchmark has
no spec, a quantity has fewer than two references without a reviewed exemption, a tolerance has
no justification, a test asserts a looser tolerance than its spec, or a pull request loosens a
spec tolerance without the `tolerance-change` label. Single-reference benchmarks (#1481) and the
unaudited legacy validation files (#1482) are listed as explicit exemptions. Tests and CI only;
no solver change, and no project needs recalculation.
