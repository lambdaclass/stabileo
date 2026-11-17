# Solve and results performance audit — 2026-11-16

Branch: `perf/solve-and-results`, based on `d877e0b532`.

Follow-up correction: the standalone benchmark introduces a model-preparation
loop that the normal application bundle does not contain. It adds about 511 ms
on the tower and 4.6 ms on the building in a later run. Treat the whole-workflow
timings below as harness measurements, not application latency. The isolated
combination timings exclude this preparation. See the
[follow-up analysis](SOLVE-FOLLOWUP-2026-11.md) for evidence, corrected prototype
timings, and the next optimization targets.

The [November 17 kernel changes](SOLVER-KERNELS-2026-11.md) use the corrected
benchmark in both arms and reduce warm solve time by a further 7–16% on the
measured models.

## Findings

The main opportunities are repeated result transfer, repeated diagram sampling,
and the design workflow. They are distinct costs; reducing structural solve time
alone does not remove the delay in generating design results.

The first change batches 3D combination calls across the JavaScript/WASM boundary.
On the original building benchmark, warm solve time fell from 85.4 to 67.8 ms
(20.6%). The new sampling change reduces governing-result calculation on the same
building from 9.9 to 4.25 ms. With 35 combinations, governing calculation falls
from 46 to 20.2 ms. These measurements describe separate experiments and should
not be added into an end-to-end speedup claim.

The building's design workflow takes approximately 10.6 seconds, compared with
about 80 ms for its structural solve in that benchmark. Design is the larger
remaining target when the reported delay occurs after requesting design results.
Reusing support plans within verification reduces the building's design median
to 9.29 seconds, with identical captured design output.

[Raw timings, output hashes, and CPU-profile summaries](solve-results-audit-2026-11-16.json)
accompany this report. The earlier unbatched solve baseline is retained in
[the batch experiment](solve-batch-2026-11-16.json).

## Method and limits

- macOS arm64, Node 22.23.5, Rust 1.99.1, wasm-pack 0.15.1, Chromium 148.0.7778.96.
- Release WASM and an unminified Vite production-mode build. No Nix or backend.
- Seven solve rounds per model; first run reported separately, median of the next
  six. Parallel and synchronous order alternates. Every round checks numerical
  parity of cases, combinations, and envelopes outside the timed region.
- Combination transfer also has a same-session comparison: individual calls and
  the batch call consume identical case results in alternating order.
- `model@35` generates additional factor-scaled combinations from that model's
  original combinations. This is a computational stress case, not a new validated
  engineering example.
- Diagram build measures Three.js geometry creation for `momentY`, without value
  labels, and disposes the objects afterward. It does not measure GPU rendering,
  the full viewport, first paint, or interaction latency.
- CPU profiles cover the main thread, including benchmark comparison code. Worker
  CPU is not captured. Profiled timings are not used for speedup claims.
- The design benchmark runs four iterations, reporting the median of the three
  warm iterations. Its existing `otherMs` bucket includes demand preparation,
  code checking, candidate search, verification, and publication; it is not a
  single identified function.
- These are local measurements, not mobile-device results or CI budgets. Cold
  runs include worker setup but exclude model loading and initial WASM startup.

## Workload coverage

| Model | Members | Shells | Characteristics |
|---|---:|---:|---|
| Building | 203 | 77 | 7 cases, 7 combinations, 28 declared constraints |
| Building @35 | 203 | 77 | Same structure, 35 combinations |
| Pipe rack | 138 | 0 | 4 cases/combinations after example loading |
| Diagnostic shells | 32 | 24 | Mixed member/shell results, 3 combinations |
| Industrial frame | 729 | 0 | 116 tension-only members; nonlinear dispatch |
| Diagrid tower | 3,414 | 0 | 1,090 nodes, 4 cases/combinations, no declared constraints |

An important correction to the initial hypothesis: the building does **not**
exercise shared factorization in the synchronous multi-case path. The engine
delegates constrained models to separate case solves
([load_cases.rs](../../engine/src/solver/load_cases.rs)). The industrial frame
also does not compare two linear dispatch strategies: both service entry points
route its tension-only members through the nonlinear plan. The benchmark now
records constraint count, nonlinear behavior, analysis setting, and phase logs.

## Fixes prepared

### Batch combination transfer

`combine_results_batch_3d` deserializes case results once and borrows them for each
combination. It uses the existing checked combination routine, preserves factor
order and duplicate-factor behavior, and leaves shell recovery and envelope
calculation in their existing order. No factorization or solver tolerance changes.

| Model | Individual combination calls | Batched calls |
|---|---:|---:|
| Building | 35.15 ms | 15.90 ms |
| Building @35 | 174.30 ms | 51.20 ms |
| Pipe rack | 22.95 ms | 19.80 ms |
| Diagnostic shells | 5.10 ms | 4.20 ms |

These numbers isolate combination processing, excluding the subsequent envelope.
The 35-combination improvement is approximately 71% for that phase.

Tests cover exact agreement with individual calls, envelope agreement, negative
and repeated factors, empty/missing cases, non-finite factors, plate thickness,
shell mismatch, and distorted-shell containment refusal.

### Reuse the regular diagram sampling grid

The main-thread CPU profile identified `buildSamplingPositions` as a substantial
cost: approximately 324 ms of self samples across the profiled 35-combination run.
The regular 21-point grid is now constructed once. Point loads and variable
sections still add their own discontinuity/boundary positions. Returned diagram
points remain independent and mutable; no result-object cache was introduced.

| Model | Governing calculation before | After |
|---|---:|---:|
| Building | 9.90 ms | 4.25 ms |
| Building @35 | 46.00 ms | 20.20 ms |
| Pipe rack | 3.45 ms | 1.40 ms |
| Diagnostic shells | 0.60 ms | 0.20 ms |

### Reuse sampled diagrams during mesh construction

Previously `createDiagramGroup3D` sampled every member for global scaling, then
sampled it again for geometry. It now retains those diagrams for that construction
only. Tests verify one sampling call per member, expected mesh coordinates and
scale, independent returned points, and off-grid load/section transitions.

Geometry-build medians moved from 6.9 to 6.6 ms for the building, 4.55 to 4.35 ms
for the repeated building @35, and 3.3 to 2.9 ms for the pipe rack. These modest
differences should not be advertised as a large rendering improvement.

### Reuse support plans within candidate verification

The design CPU profile places about 22.5 seconds of inclusive samples in candidate
search and 13.8 seconds in the code-check pass across four design runs. These
are profiling totals, not medians per run. `planSupportEnd` accounts for about
5.1 seconds of self samples; Rust `flexure_at` accounts for about 7.1 seconds.
Garbage collection, cloning, and JS/WASM transfer are also visible. Benchmark
loading and output serialization are included in the overall profile, so their
costs must not be attributed to the timed design function.

Within one candidate verification, the same support plan was recomputed by
bottom-bar reach, anchorage verdicts, and, when present, joint threading. The
adapter now computes it once and passes it to those consumers. The next candidate
computes a fresh plan. No persistent cache, candidate reordering, or change to
the verifier was introduced.

| Model | Design before | After | Reduction |
|---|---:|---:|---:|
| Building | 10,621.3 ms | 9,293.4 ms | 12.5% |
| `rc-design-qa-8` | 199.3 ms | 164.7 ms | 17.4% |
| `rc-design-qa-row2` | 205.9 ms | 186.7 ms | 9.3% |

Complete benchmark outputs match exactly on all three examples: assemblies,
reinforcement, and verification outcomes, with the benchmark's existing
normalization of `searchStats.ms`. Tests cover one plan per verification, a fresh
plan after changing bars, bottom-reach agreement, and anchorage/joint results.

## Larger-model results

With the prepared changes, the industrial model takes about 1,513 ms through
either service entry point because both use the nonlinear plan. The tower takes
about 1,539 ms through the parallel path and 1,884 ms through the synchronous
multi-case path. Its first parallel run takes 2,585 ms, governing calculation
80 ms, and diagram geometry construction 71 ms.

One warm tower phase log reports 474 ms for worker solve/return and 544 ms for
combination/envelope work. The whole service call also includes preparation and
finishing. Instrument those explicitly before attributing the remaining gap to
any particular validation routine. A single phase log is not a phase median.

## Remaining work, in priority order

1. **Design generation and verification.** The building's original warm design median is
   10,621 ms: member detailing around 550 ms, floor detailing 217 ms, and the
   remaining work around 9,863 ms (medians of buckets need not sum exactly).
   Support-plan reuse removes part of this cost. Next isolate the flexural-capacity
   work inside the code-check pass and remaining candidate verification. Any
   preparation reuse needs to include section shape, materials, demand, code
   edition, and reinforcement geometry in its validity conditions.
   Preserve the authoritative verifier, refusal states, deterministic per-member
   budgets, and the whole-run time cap.
2. **Keep long work off the UI thread.** Basic 2D's manual action calls the
   synchronous solver, despite an async path existing. Nonlinear and P-Delta
   combination plans also return synchronous work. Moving them requires tests
   for stale results, edits during a solve, failure handling, and cancellation.
   This is a responsiveness improvement, not automatically a throughput gain.
3. **Reduce remaining combination/envelope transfers.** The batch change removes
   repeated case inputs, but combinations still return to JS and then enter WASM
   again for their envelope. A fused API could retain them in Rust, provided
   shell recovery, axial corrections, containment, and envelope semantics remain
   equivalent. Measure transfer and envelope CPU separately first.
4. **Worker preparation reuse and cold startup.** Evaluate persistent prepared
   systems or case groups per worker against several models. Do not simply replace
   the parallel path with synchronous multi-case solving. Preserve the existing
   serialized first-execution mitigation for browser crashes; eager concurrent
   warmup is not justified by these measurements.
5. **Full interaction/render profiling.** Measure Solve-click to visible results,
   event-loop stalls, diagram switching, GPU draw calls, labels, and memory on
   large models. Existing geometry measurements do not cover those costs. The
   renderer already indexes forces/displacements in several paths; isolated
   `.find()` calls in inspector accessors do not establish a global bottleneck.

Safety validation, shell containment, nonlinear behavior, sampling density, and
engineering tolerances were not weakened to obtain these improvements.

## Validation

- 122 focused unit tests passed across combination handling, worker startup,
  case composition, diagram geometry, governing peaks, support anchorage, hooks,
  and joint threading.
- 175 results-snapshot tests passed; one existing test was skipped. No committed
  numerical snapshots were changed.
- `make NIX_RUN= typecheck.web` passed its existing-baseline and guarded-path gates.
  This does not mean the repository has no pre-existing TypeScript/Svelte errors.
- Real Chromium benchmark builds and runs passed, including shells, constrained
  and nonlinear models, and the 3,414-member tower. All solve rounds passed the
  benchmark's numerical comparison; the three design outputs matched exactly
  after the established timing-field normalization.
- Full application E2E, GPU rendering, and mobile-device performance remain
  outside this audit's measurements.

## Reproduce

```sh
make NIX_RUN= bench.web.solve ARGS='pro-edificio-7p pro-edificio-7p@35 pipe-rack rc-qa-diagnostic-shells'
make NIX_RUN= bench.web.solve ARGS='3d-nave-industrial xl-diagrid-tower'
make NIX_RUN= bench.web.design
BENCH_PROFILE=/tmp/solve-profile make NIX_RUN= bench.web.solve ARGS='pro-edificio-7p@35'
```

Use `BENCH_OUTPUT=/tmp/results.json` to save raw timings. The profile option writes
Chrome DevTools `.cpuprofile` files with a numeric suffix. Run timing jobs alone;
do not compare timings captured while compilation or test suites are active.
