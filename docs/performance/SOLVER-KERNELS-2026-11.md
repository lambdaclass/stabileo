# Solver validation and span-rotation performance — 2026-11-17

Two Rust hot-path changes reduce warm solve time by 7–16% on the measured models.
The captured complete result bundles match exactly, including diagnostics,
after omitting only timing fields. These are additional improvements over
`0923adb97`, which already contains batched combination transfers.

## Changes

`engine/src/boundary.rs` keeps diagnostic paths as static field names, numeric
indices, and owned dynamic map keys. It creates the printable path only when a
failure requires it. Every value is still checked for finiteness, custom
serializer failures retain their handling, and containment still runs afterward.

`engine/src/known_issues.rs` prepares the cubic interpolation nodes' other-node
arrays and denominators once per span-rotation calculation. Shear-interpolation
denominators are also prepared once. The station loop no longer allocates a
three-element vector for every interpolation term. Arithmetic order, station
breaks, root searches, and refusal thresholds are preserved.

The benchmark preparation loop now has explicit blocks. Its runtime check
compares the number of load-node reads with 2 and 64 connected nodes. Before the
fix, the bundled check failed with `2 vs 64`; afterward it passes. This addresses
the benchmark-only defect documented in the [follow-up audit](SOLVE-FOLLOWUP-2026-11.md).
Both timing arms below include this correction, so it contributes none of the
reported improvement.

## Results

| Model | Baseline warm solve | Optimized warm solve | Reduction |
|---|---:|---:|---:|
| Diagrid tower, 3,414 members | 1,033.3 ms | 865.6 ms | 16.2% |
| Building | 61.6 ms | 57.4 ms | 6.8% |
| Building, 35 combinations | 144.25 ms | 132.7 ms | 8.0% |
| Nonlinear industrial frame | 1,501.7 ms | 1,374.1 ms | 8.5% |
| Diagnostic shells | 12.5 ms | 10.6 ms | 15.2% |

The isolated batch-combination measurement on the tower moves from 361.35 to
269.4 ms, a 25.4% reduction for that phase. The nonlinear model's service entry
still routes through its synchronous nonlinear plan; it is not a comparison of
two linear solver strategies. No factorization algorithm was changed.

Measurements use the existing macOS arm64 native toolchain and Chromium harness:
seven rounds, first separately recorded, median of six warm rounds, alternating
parallel and multi-case order. Build and test jobs completed before timing.
These are local harness measurements, not click-to-visible-results latency.
They measure the two Rust changes together, not their separate contributions.

[Raw timing rows, exact-output hashes, and source hashes](solver-kernels-2026-11-17.json)
are retained. Full local outputs are in `/tmp/stabileo-kernel-baseline.json` and
`/tmp/stabileo-kernel-optimized.json`. The benchmark captures the parallel bundle
on round 1 and excludes only `timings` keys; the two captured strings are exactly
equal on every model in the table. Every round also passes the existing
parallel/multi-case and individual/batched combination comparisons. An additional
optimized pipe-rack run passes those comparisons but has no new baseline here.

## Validation

- 8 Rust boundary tests passed, including exact paths through arrays, tuples,
  variants, maps with numeric/empty/bracket-prefixed keys, and custom serializers.
  NaN, both infinities, first-failure ordering, and intentional unbounded ratios
  retain their outcomes.
- 32 Rust known-issue/span tests passed. New differential tests compare exact
  float bits with the original interpolation implementation for mixed loads,
  releases, shear flexibility, thermal curvature, twist, extreme scales,
  near-limit rotations, and non-finite inputs.
- 126 focused web tests and 175 result-snapshot tests passed; one existing skip.
  No numerical snapshots changed.
- `make NIX_RUN= typecheck.web` passed the existing-baseline and guarded-path gates
  (247 pre-existing TypeScript errors; no additions).
- The rebuilt WASM completed all browser benchmark runs. The solve benchmark's
  build test now executes the bundled preparation check and pipe-rack comparisons
  instead of stopping after compilation; that test passed as well.
- `make NIX_RUN= lint.engine`, changelog validation, and `git diff --check` passed.
  The earlier batch export was added to the invariance registry as postprocessing,
  matching the existing single-combination export.

## Reproduce

```sh
make NIX_RUN= test.engine.lib FILTER=boundary::
make NIX_RUN= test.engine.lib FILTER=known_issues::
STABILEO_WASM_CACHE=0 make NIX_RUN= wasm
BENCH_OUTPUT=/tmp/solver-results.json make NIX_RUN= bench.web.solve ARGS='xl-diagrid-tower pro-edificio-7p pro-edificio-7p@35 3d-nave-industrial rc-qa-diagnostic-shells'
make NIX_RUN= test.web.results
make NIX_RUN= typecheck.web
```

For a baseline comparison, retain the benchmark correction and output capture
while restoring the two Rust implementation files to `0923adb97`, rebuild WASM,
and run the same command. Restore the optimized source and rebuild before using
the application again. Large captured outputs are intentionally kept outside Git.

## Remaining work

The subsequent [combined envelope operation](FUSED-ENVELOPE-2026-11.md) implements
the transfer reduction for eligible linear models and measures its additional gain.

The next substantial opportunities remain combination-to-envelope transfer,
repeated span load evaluation, and matrix preparation for repeated nonlinear
active sets. Profile the optimized build before choosing among them. Moving
nonlinear workflows to workers would improve responsiveness independently of
throughput. The current changes do not measure GPU rendering, UI event-loop
stalls, mobile performance, or full design generation.
