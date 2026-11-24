### BREAKING (results)

#### Refuse non-finite solver inputs and preserve planar case factors

Analysis rejects non-finite inputs before JSON serialization and identifies the invalid field. Planar combinations retain a case named `__proto__` and apply its resolved factor. See [the results change](../docs/results-changes/2026-11-solver-json-boundary.md). (#2292, #2297)
