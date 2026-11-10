# Exact plastic LP fuzz budget: bounded replay report (2026-11-10)

The element-count-only hypothesis is supported for the thirteen 3D artifacts: each performs bounded certificate work, allocates heavily over the call, and releases its Rust allocations between calls. ASan magnifies the process footprint. None of the fourteen recorded corpus replays retained Rust allocations, hung, panicked, or crossed its replay resource limit. #1261 is a separate current-state result: the 2D API already refuses it, so its historical OOM cause is not established by these runs.

The resource classification does not mean that every incremental collapse factor is certified. All thirteen 3D artifacts returned a factor below the exact collapse interval with an existing biaxial lower-bound warning. The combined checked API now returns the certified lower bound and warns about that conservative mismatch. The separately preserved grid-slab performance case now receives an engine resource refusal before exact LP work. These engine findings are handled outside the fuzz skip.

The measurement tables and `plastic-lp-budget-replays.json` below record commit
5c0ca25b3's blanket-refusal implementation. Their timings, memory observations and
raw certificates are historical evidence, not the final return policy. The
[follow-up results](plastic-certified-lower-results.json) record all thirteen
artifacts succeeding with the certified lower bound and retained raw mismatch
warnings after the policy correction. #1261 remains refused.

## Reproduction and measurement

Every listed issue was read with `gh issue view`. Its `raw_hex` was decoded without reformatting the bytes. Every artifact’s SHA-1 matches the original `oom-*` or `slow-unit-*` filename in the issue body. The unchanged bytes are in [the corpus](../../engine/fuzz/corpus-regressions/plastic-lp-budget). Hashes, individual call measurements, refusal phases and work forecasts are in [the replay data](plastic-lp-budget-replays.json).

Each artifact runs alone in a child process and is called five times in that same process. The supervisor enforces a 60-second wall limit, a CPU limit, a 512 MiB address-space limit and a 512 MiB RSS limit. The ASan-only replay repeats each artifact three times, retains the original fuzz job’s 2048 MiB RSS limit and the same wall limit, and omits the incompatible address-space limit required for ASan shadow memory. No sanitizer quarantine setting is reduced. This is not a full coverage-instrumented libFuzzer session. An initial 512 MiB ASan probe of #1760 hit its RSS cap; the reported ASan corpus runs use the existing 2 GiB production fuzz limit, while native replay retains the 512 MiB cap.

The allocator meter records live bytes before and after each call, the call’s peak live Rust allocations and cumulative allocation traffic. The returned textual report is excluded from retained bytes. The original meter initialized stdout between calls; the revised executable initializes stdout before measurements and checks every call, including call zero. Historical allocation-traffic values used full realloc sizes and are not incremental-growth measurements. Every measured call has zero retained bytes. Kernel `wait4` accounting and `/proc` record RSS high-water marks; process RSS includes the fork/exec launcher, sanitizer and allocator state. Native replay executables use Rust 1.99.0 on this host; ASan and the WASM build use the repository’s Rust 1.99.1. The final native targets and the complete bounded corpus also pass with the pinned Rust 1.99.1 toolchain. These are budget observations, not a compiler performance comparison.

```sh
make test.engine.plastic-budget
make test.engine.plastic-budget-watchdog
make test.engine.plastic-resource
make test.engine.plastic-budget-corpus
make test.engine.plastic-wasm
make replay.engine.plastic-budget FILE=engine/fuzz/corpus-regressions/plastic-lp-budget/issue-1760.bin MODE=engine REPEATS=5
make replay.engine.plastic-budget-asan FILE=engine/fuzz/corpus-regressions/plastic-lp-budget/issue-1760.bin MODE=engine REPEATS=3
```

The `before` column uses the preserved native executable built before the fixes. The two reproducer commits are `e6d0818b3` (fourteen failing assertions when explicitly run despite their known-wrong ignores) and `6a4765f75` (the separate #743 one-second watchdog failure). The fix removes all of those ignores. Each command replays one artifact; no soak, benchmark sweep or full test suite was run.

## All fourteen artifacts: before and after

Time is the slowest individual call, not the sum of all repetitions. Heap is the maximum live Rust allocation. `M` means the new `PL-3D-CERTIFICATE-MISMATCH` refusal; `2D` means the existing `PL-2D-INVARIANCE` refusal. Every 3D row is a harness resource-budget finding; #1261 remains an existing refusal rather than evidence of an expensive current LP.

| Issue | Before s / heap MiB | After fuzz gate ms | After direct engine s / heap MiB | Engine result |
|---|---:|---:|---:|---|
| [#951](https://github.com/lambdaclass/stabileo/issues/951) | 1.057 / 2.290 | 0.419 | 1.081 / 2.290 | M; fuzz skips LP |
| [#952](https://github.com/lambdaclass/stabileo/issues/952) | 1.060 / 2.159 | 0.430 | 1.129 / 2.159 | M; fuzz skips LP |
| [#953](https://github.com/lambdaclass/stabileo/issues/953) | 1.045 / 2.290 | 0.500 | 1.248 / 2.290 | M; fuzz skips LP |
| [#989](https://github.com/lambdaclass/stabileo/issues/989) | 1.153 / 2.290 | 0.437 | 1.107 / 2.290 | M; fuzz skips LP |
| [#990](https://github.com/lambdaclass/stabileo/issues/990) | 1.043 / 2.290 | 0.417 | 1.099 / 2.290 | M; fuzz skips LP |
| [#991](https://github.com/lambdaclass/stabileo/issues/991) | 0.926 / 2.296 | 0.421 | 1.015 / 2.296 | M; fuzz skips LP |
| [#1081](https://github.com/lambdaclass/stabileo/issues/1081) | 1.074 / 2.290 | 0.417 | 1.100 / 2.290 | M; fuzz skips LP |
| [#1082](https://github.com/lambdaclass/stabileo/issues/1082) | 1.043 / 2.318 | 0.449 | 1.113 / 2.318 | M; fuzz skips LP |
| [#1261](https://github.com/lambdaclass/stabileo/issues/1261) | 0.000169 / 0.020 | 0.327 | 0.000088 / 0.009 | 2D; unchanged refusal |
| [#1349](https://github.com/lambdaclass/stabileo/issues/1349) | 2.085 / 3.835 | 0.337 | 2.199 / 3.835 | M; fuzz skips LP |
| [#1458](https://github.com/lambdaclass/stabileo/issues/1458) | 1.210 / 2.008 | 0.416 | 1.254 / 2.008 | M; fuzz skips LP |
| [#1459](https://github.com/lambdaclass/stabileo/issues/1459) | 3.831 / 4.715 | 0.412 | 3.958 / 4.715 | M; fuzz skips LP |
| [#1460](https://github.com/lambdaclass/stabileo/issues/1460) | 1.726 / 2.235 | 0.441 | 1.782 / 2.235 | M; fuzz skips LP |
| [#1760](https://github.com/lambdaclass/stabileo/issues/1760) | 1.433 / 3.253 | 0.421 | 1.491 / 3.253 | M; fuzz skips LP |

## ASan replay and allocation traffic

Every ASan artifact completed three calls in one process under the original 2 GiB fuzz RSS budget. The large difference between live heap and process RSS demonstrates that the historical OOM filename cannot be treated as the input’s retained engine heap. The short replays do not reproduce the original long mixed-input fuzz session or prove exactly when its process RSS crossed 2 GiB.

| Issue | ASan max call s | ASan peak live MiB | ASan peak RSS MiB | Native allocated MiB/call, max | Retained bytes/call |
|---|---:|---:|---:|---:|---:|
| #951 | 2.549 | 2.290 | 607.9 | 471.0 | 0 |
| #952 | 2.742 | 2.158 | 612.0 | 469.6 | 0 |
| #953 | 2.578 | 2.289 | 607.9 | 471.0 | 0 |
| #989 | 2.497 | 2.289 | 608.0 | 471.0 | 0 |
| #990 | 2.529 | 2.289 | 608.0 | 471.0 | 0 |
| #991 | 2.324 | 2.296 | 574.0 | 438.6 | 0 |
| #1081 | 2.494 | 2.289 | 608.0 | 471.0 | 0 |
| #1082 | 2.527 | 2.318 | 609.2 | 470.8 | 0 |
| #1261 | 0.000732 | 0.008 | 15.3 | 0.0 | 0 |
| #1349 | 6.219 | 3.834 | 933.1 | 804.9 | 0 |
| #1458 | 2.890 | 2.007 | 650.5 | 505.7 | 0 |
| #1459 | 14.328 | 4.714 | 1174.0 | 1151.8 | 0 |
| #1460 | 3.998 | 2.234 | 844.1 | 672.7 | 0 |
| #1760 | 3.563 | 3.253 | 769.0 | 608.5 | 0 |

## Budget derived from the engine construction

The certificate pipeline uses an f64 candidate LP plus exact rational equilibrium, static and mechanism checks. `PlasticLpWork` is constructed beside `initial_samples` in [the 2D implementation](../../engine/src/certify/plastic.rs) and [the 3D implementation](../../engine/src/certify/plastic_3d.rs). It uses their real samples and shares their refinement constants. Equilibrium rows are counted without allocating the dense matrix; a regression checks the dimensions against the engine’s actual limit problem, including a release.

- 2D starts with both end samples plus the existing piece samples; each of the existing six refinement passes can add at most two stationary points per curved load piece. Each section supplies two signed halfspaces.
- 3D uses the existing eight polygon directions, sixteen intervals on loaded pieces, and sixty refinement passes. Each pass can insert at most 63 new section samples per loaded piece. Existing section polygons gain at most two directions per pass; a new section starts with at most nine directions.
- With `V` member-force variables, use `P = V + 1` as a rank-independent upper bound on dual rows. With `H` halfspaces, the dense simplex tableau has at most `P * (H + P + 1)` cells, including artificial variables and the right-hand side.
- The historical initial pivot-work metric multiplies its initial tableau cells by `2 * 50 * (H_initial + P) + P`: the two existing simplex phases and at most `P` artificial-basis cleanup pivots. The multiplier 50 is extracted from, and still used by, the engine simplex. This metric counts possible tableau-cell/pivot work; it is not a full FLOP or wall-time bound.

The [shared work type](../../engine/src/certify/plastic_budget.rs) uses saturating arithmetic. Current admission sums overlapping exact equilibrium, its floating copy, and tableau storage. Exact elimination reserves its input, working rows, pivot-row copies, particular solution and null basis, plus arithmetic scratch. Each rational and each multiply/subtract forecast is limited to 8192 numerator-plus-denominator bits before allocation. Elimination returns an error on excess; equilibrium and bundle callers propagate it, while an unavailable mechanism candidate cannot supply a certificate.

The engine storage ceiling remains 1 GiB, the separate elimination workspace cap is 512 MiB, and the fuzz forecast ceiling remains 128 MiB. Once equilibrium supplies the actual null-space dimension, a second check adds the simplex matrices, reinversion and dense-solve workspace to the retained exact and floating blocks. These byte limits do not claim a wall-time guarantee or a process RSS bound. The pivot counter remains diagnostic metadata and never decides admission.

The following table records the old nominal estimate, not current storage accounting. See `review_correction.current_plans` in the JSON for current forecasts.

| Representative model | Force variables | Initial halfspaces | Max refined halfspaces | Nominal dense bytes | Initial pivot cells |
|---|---:|---:|---:|---:|---:|
| 8-member issue portal | 48 | 368 | 981128 | 384621776 | 855103018 |
| 24-member grid slab | 144 | 384 | 6144 | 7296400 | 4076508250 |
| loaded fixed-beam success control | 6 | 136 | 489796 | 27429024 | 14421456 |
| cantilever admission/round-off control | 6 | 16 | 256 | 14784 | 387576 |

An eight-member model with its distributed loads removed is admitted by the fuzz LP budget, while the unchanged loaded issue model is skipped. A loaded one-member fixed beam is admitted, solves, and has its factor inside the exact interval. Its independent fixed-beam mechanism formula is the same one already tested in `fixed_beam_udl_in_each_plane` in `engine/tests/certify_plastic_3d.rs`.

## Separate engine findings and controls

**#743 / grid-slab admission case.** The checked-in grid has 24 members and 16 nodes. Its tableau forecast is 912050 cells (7296400 bytes); the old 4076508250 pivot-cell counter alone caused refusal. That counter was not a storage index or a measured wall-time model. Both engine and fuzz storage admission now accept the grid, including the rational and overlapping workspace forecast. The retained `before-grid` observation was killed after one second with no completed iteration. It establishes neither a memory overrun nor a 60-second overrun. The historical refusal and fuzz skip remain in the JSON as superseded observations. The targeted admission regression does not run the historically expensive full grid solve.

A separate `over-budget-grid.bin` applies the distributed-load template from the existing #1760 seed to every member. Its forecast exceeds the storage budget and exercises the named dense-storage refusal, including the WASM target.

**Checked-factor mismatch.** The thirteen 3D issue artifacts have sound exact bounds and conservative raw factors below their intervals. The combined API returns `lambdaLower` as `collapseFactor`, preserving the raw factor, mismatch flag and deviations, with explicit text and structured warnings. It refuses when no sound certificate is available; a sound finite ordered interval supplies the returned lower bound regardless of the raw factor’s position. The original cantilever roundoff control is conservative and now succeeds. The separate [above-interval roundoff reproducer](PLASTIC_3D_RAW_FACTOR.md) and the in-plane portal also return their certified lower bounds with warnings. See the [results change](../results-changes/2026-11-plastic-3d-certified-lower-bound.md). No tolerance or exact-bound assertion changes.

**Seeded true faults.** The loaded fixed-beam seed succeeds with certified bounds enclosing its closed-form collapse factor. In the replay executable, the same admitted seed with a planted hang is killed by the 0.5-second watchdog; a planted 1 MiB allocation leak per call is reported as retained allocation. The production fuzz target and the replay share the same dispatch, input gate and output checks. The injected faults exist only in the replay executable. The nightly JSON-plastic job runs these controls and all fourteen bounded direct-engine regressions, then includes the checked-in seeds in its corpus. Excluded expensive artifacts are therefore still exercised through the engine boundary.

**Validation.** The follow-up targeted fuzz-library regressions assert exact equality of returned factors to `lambdaLower` for all thirteen artifacts, preserved raw factors, mismatch flags, text and structured warnings, serialized steps and hinges, conservative roundoff acceptance, missing-certificate refusal, above-interval lower-bound return with a warning, and an inside-interval control. The bounded corpus runs each original artifact three times with the same allocation and watchdog checks. The compiled WASM API checks certified-lower successes for raw factors on either side of the interval and a separate oversized-grid storage refusal. Existing certificate, raw-factor and theorem assertions remain unchanged; combined-entry tests now check their returned certified lower bounds. Targeted registry and web certificate-reading tests cover the changed result contract.

**Limits of the conclusion.** No retained engine allocation, unbounded LP growth, panic or genuine hang was observed for these fourteen artifacts. The original long mixed-input, coverage-instrumented fuzz process was not reconstructed; #1261’s historical OOM attribution remains unverified. The storage policy is not a universal bound on every certificate operation or browser wall time. Newly observed failures on admitted inputs must still fail the fuzz watchdog and be investigated; the process time/RSS limits and output assertions were not relaxed.
