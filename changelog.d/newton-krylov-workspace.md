### Changed
#### Reuse experimental Newton–Krylov workspace and report work (2026-11-25)

Krylov products, constraint transforms and cached Cholesky solves reuse their
vectors without changing arithmetic order, convergence tolerances or fallbacks.
Optional profiling reports iterations, factorization requests and individual
fallback reasons, including work in rolled-back increments. Native callers use
`solve_corotational_2d_profiled` / `solve_corotational_3d_profiled`; experimental
WASM accepts `profile: true` and returns `{ result, work }`. The existing output
is unchanged when profiling is omitted. `make bench.engine.krylov-work` runs
repeatable release measurements and emits the complete results for comparison.
