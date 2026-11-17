# Compute combinations and envelopes in one WASM call — 2026-11-17

The parallel linear solve now computes load combinations and their envelope in
one WASM call when the model has no shells and combination IDs are unique. On
the measured tower and 20-combination pipe rack, this reduces the combined phase
by about 14% and warm service time by 6% and 13%, respectively.

This is an additional change on top of the [solver kernel optimizations](SOLVER-KERNELS-2026-11.md).
Both arms use those optimizations and the corrected benchmark preparation loop.

## Implementation and preserved behavior

`combine_results_envelope_3d` uses the existing checked batch-combination routine.
It serializes the combinations through the normal validated output boundary,
retains their Rust records, then computes and serializes the envelope through its
existing checked routine and output boundary. It returns the two already-validated
JS values together. The extra deserialization of every combined result disappears.
No solver, envelope arithmetic, diagnostic threshold, or factor ordering changes.

Combination validation still precedes envelope processing. Tests verify identical
overflow refusal text, including paths, and the envelope's station-overflow and
distorted-shell refusals. Raw result serialization still passes through the same
typed unit records. Empty/missing combinations retain their output slots; an empty
envelope remains null.

The service opts out for shells because it currently recovers shell stresses
between combination and envelope calculation. It also opts out for repeated
combination IDs: the existing map keeps insertion order, replaces an ID's last
nonempty result, and ignores a later empty slot. These cases retain the separate
calls. Settlement/case-displacement finishing, active scopes, and magnitude or
spectral finishing remain downstream of the linear core. Nonlinear and P-Delta
plans are unchanged.

## Measurements

Seven rounds per example, median of six warm rounds, local Chromium on macOS
arm64 using the same native toolchain as the previous audit. Tests and builds
finished before timing. The final reference run uses the same WASM build and
extended benchmark as the optimized run, temporarily selecting separate calls
in the service. The optimized source was restored afterward. These are
service/harness timings, not click-to-visible
results or GPU rendering measurements.

| Eligible model | Warm solve before | After | Reduction |
|---|---:|---:|---:|
| Tower, 3,414 members / 4 combinations | 951.95 ms | 890.85 ms | 6.4% |
| Pipe rack / 20 combinations | 99.75 ms | 86.50 ms | 13.3% |

The benchmark additionally alternates both APIs on identical case outputs in
the same page, outside the whole-solve timing:

| Model | Separate batch + envelope | Combined call | Reduction |
|---|---:|---:|---:|
| Tower | 398.70 ms | 344.55 ms | 13.6% |
| Pipe rack / 20 combinations | 88.85 ms | 76.05 ms | 14.4% |

The final reference run repeats that isolated comparison and gives 401.75 versus
343.80 ms for the tower and 89.05 versus 75.75 ms for the pipe rack, consistent
with the gain above.

The synthetic 20-combination workload scales factors from the pipe rack's
existing combinations; it is a computational stress case, not a separately
validated engineering model.

Controls retain their previous paths: the shell building measured 58.50 versus
58.85 ms, and the nonlinear industrial frame 1,377.40 versus 1,375.05 ms. Those
small differences are run variation, not benefits of fusion.

All four captured complete parallel result bundles match as exact JSON strings
after omitting only timing fields, including diagnostics and envelope data.
Every round also passes parallel-versus-multi-case and individual-versus-batch
comparisons. The isolated combined-call comparisons pass as well.

[Raw rows, output hashes, and source hashes](fused-envelope-2026-11-17.json) are
retained. Full output captures remain at `/tmp/stabileo-fused-reference.json` and
`/tmp/stabileo-fused-optimized.json` rather than adding large result bundles to Git.
The earlier exploratory baseline is `/tmp/stabileo-fused-baseline.json`.

## Validation

- 57 focused tests passed: combination factors and missing slots, plate thickness,
  shell mismatches, containment and overflow refusals, service-path selection,
  duplicate IDs, active scopes, settlement and case displacements, axial shares,
  and worker behavior.
- 175 snapshot tests passed, with one existing skip. No snapshots changed.
- Engine lint and existing-baseline web type-check gates passed (247 pre-existing
  TypeScript errors; no additions). The new export is registered as postprocessing
  in the invariance registry.
- Real Chromium benchmarks exercised both the eligible path and shell/nonlinear
  controls, with fallback warnings treated as benchmark failures.

## Reproduce

```sh
STABILEO_WASM_CACHE=0 make NIX_RUN= wasm
BENCH_OUTPUT=/tmp/fused-envelope.json make NIX_RUN= bench.web.solve ARGS='xl-diagrid-tower pipe-rack@20 pro-edificio-7p 3d-nave-industrial'
```

The benchmark's `medianSeparateEnvelopeMs` and `medianFusedEnvelopeMs` compare
both calls on the same cases, so the phase comparison does not require reverting
the service. These fields are omitted for shell and nonlinear models.

Full shell fusion requires establishing equivalence of stress recovery order.
The next broader opportunities remain repeated span-load evaluation and repeated
nonlinear matrix preparation; neither is changed here.
