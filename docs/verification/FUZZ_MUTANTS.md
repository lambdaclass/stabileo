# Fuzzing and mutation testing

Two checks of the test suite itself, beside the certificates (CERTIFY.md) and the Kani
proofs (KANI.md):

- **Fuzzing** (`engine/fuzz`, cargo-fuzz / libFuzzer) feeds the entry points the WASM
  layer exposes with inputs nobody wrote by hand and checks properties every result
  must have.
- **Mutation testing** (cargo-mutants) breaks the safety-critical code one small edit
  at a time and checks that some test fails. A mutant that survives is code whose
  behaviour no test pins down.

A fuzz finding is a bug. Fix the engine and add a regression test under `engine/tests`;
never weaken a property to make a finding go away.

## What is fuzzed

| Target | Input | Entry points |
|---|---|---|
| `json_static` | selector byte, parameter byte, JSON | linear solve and certificate (2D/3D), certificate bundles, P-Delta and its certificate, load cases, combinations, envelopes |
| `json_dynamics` | same | modal, buckling, spectral, time history, harmonic, each with its certificate (2D/3D) |
| `json_plastic` | same | incremental plastic collapse and the exact collapse certificate (2D/3D) |
| `model_certify` | `arbitrary`-built model | linear solve, linear, buckling and modal certificates on small 2D/3D frames that always parse |
| `metamorphic` | selector byte + model JSON | any model the linear solver accepts gives the same physical answer after a rigid motion, a renumbering and a unit change (`engine/src/metamorphic`, [METAMORPHIC.md](METAMORPHIC.md)) |

The JSON targets go through the same `serde_json` deserialization as `engine/src/lib.rs`,
so a malformed or hostile model file reaches the code exactly as it would from the web
app. The parameter byte sets the numeric arguments (number of modes, P-Delta iterations
and tolerance). `model_certify` builds models with valid ids, grid coordinates,
stiffnesses over twelve decades, any support layout including none, releases, springs,
settlements and nodal, distributed and point loads, so the solver runs on every input
instead of on the rare bytes that parse as JSON.

The seed corpora come from the web app's template models (`engine/tests/fixtures`),
plus the inputs of past findings, kept in git under `engine/fuzz/regressions/<target>/`:

    cd engine && cargo run --release --example fuzz_seeds   # writes fuzz/corpus/<target>/

## Properties

Checked on every input by `engine/fuzz/src/lib.rs`:

1. **No panic.** Bad input returns `Err`; libFuzzer aborts on a panic.
2. **Bounded work.** Inputs whose work knobs exceed caps (time steps, iterations,
   subdivisions, arrays over 512, objects over 96 entries) are skipped before solving,
   and libFuzzer's `-timeout` catches the rest.
3. **Finite results.** Every number in an `Ok` result is finite, except fields that
   document +∞ (`ALLOWED_NON_FINITE` = `certify::finite::DOCUMENTED_INFINITE`:
   `relBound`, `omega2Upper`, `uniquenessRadius`, `bimoment` of combined force bounds,
   `b2Factor` with `isStable: false`), and those may only be +∞, never NaN. The check
   walks the result with a serde serializer, because `serde_json` writes NaN and ±∞ as
   `null`. The walker lives in the engine (`certify::finite`), where every certificate
   entry point runs the same check at run time (CERTIFY.md, "Non-finite numbers").
4. **Consistent certificates.** Every certified block has non-negative bounds, ordered
   enclosures (`lambdaLower ≤ lambdaUpper`, `omega2Lower ≤ omega2Upper`) that contain the
   solver's value, and a finite error bound.
5. **Equilibrium of certified linear results.** With nodal loads and plain supports,
   `|ΣR + Σf| ≤ √n · residualNorm` plus round-off, per axis.
6. **Shared support nodes** (`model_certify`). Several supports on one node are rejected
   by every analysis unless all are plain rigid restraints, which merge by OR.
7. **Lossless JSON round trip** of the model (`model_certify`).

## Findings

| Found by | Bug | Fix | Regression test |
|---|---|---|---|
| `model_certify` | Several supports on one node: each listed the node's full reaction, so ΣR double-counted it and a certified result was out of equilibrium. The root cause: 2D DOF numbering kept only the highest-id support (`fixed` id 1 plus `pinned` id 2 silently gave a pinned end), 3D ORed the flags but took springs and the inclined flag from one support picked in hash order. | One reaction entry per node; plain rigid restraints on one node merge by OR in 2D and 3D; any other combination (springs, settlements, inclined directions) is rejected with an error naming the node (`validate_input_2d/3d`). The web app already keeps one support per node. | `duplicate_support_reactions.rs` |
| `json_dynamics` | Harmonic certificate with a response DOF the load does not excite: the interval sum of squares had a −5e−324 lower end, its square root was NaN, and a "certified" result carried NaN enclosures. | Clamp the sum of squares at zero before the square root (sound: it is ≥ 0 exactly). | `fuzz_regressions.rs::harmonic_zero_response_is_finite` |
| `json_dynamics` | Time-history certificate of a structure at rest: relative residuals divided by max‖u‖ = 0 and reported +∞. | Divide by `max(‖u‖, MIN_POSITIVE)`, and report 0 for a zero residual. | `fuzz_regressions.rs::time_history_zero_solution_residuals_are_finite` |
| `json_dynamics` (#335) | `certify_spectral_3d` returned `Ok` with every displacement and element-force envelope NaN and the certificate `certified` with error bounds 0. A mode with ω < 0 made the CQC ratio ω_j/ω_i negative and r^1.5 NaN; `Enclosure::error_of` used `f64::max`, which drops NaN, so a NaN reported value got error 0 (only `reportedWithin` was false). | The spectral solver refuses ω ≤ 0 (it also silently dropped such a mode, S_d = 0), non-finite modal data, a non-finite or unsorted spectrum, ξ < 0 and non-positive factors, and checks its output. `error_of` is +∞ for a non-finite value; the certificate refuses non-finite reported values. All certificates: `certify::finite` guard (CERTIFY.md, "Non-finite numbers"). Input in `fuzz/regressions/json_dynamics/`. | `fuzz_regressions.rs::spectral_negative_omega_is_refused`, `certify_nonfinite.rs` (every kind) |
| `certify_nonfinite.rs` (#335) | The 3D plastic certificate panicked (`denominator == 0` in `num-rational`) on a member with a coordinate of ±1e300: the f64 direction overflowed to 0, picked a reference axis parallel to the member, and an exact local axis of length 0 was inverted. | Refused: the f64 direction must be a unit vector, and an exact local axis must be non-zero. The same tests found the exact plastic certificates running for minutes on a value of ±1e300 or a subnormal (bignum work grows with bit length): input magnitudes outside [1e-30, 1e30] (zero excepted) are now refused (`plastic::EXACT_MIN_ABS`/`EXACT_MAX_ABS`). | `certify_nonfinite.rs::every_leaf_nan_or_inf_is_refused_or_finite`, `mutated_inputs_are_refused_or_finite` |

Found while triaging surviving mutants (below), each with a regression test:

| Bug | Fix | Test |
|---|---|---|
| An unknown 2D support type (a typo, `"pin"`, `"roller"`, a 3D type in a 2D model) restrained nothing, silently. Five engine tests used `"pin"`/`"roller"` and so ran unsupported models. | Rejected with the list of accepted types; `"free"` stays as the explicit no-restraint type. The tests now use `"pinned"`/`"rollerX"`. | `solver_mutation_kills.rs::unknown_2d_support_type_is_rejected` |
| A 3D `isInclined` support with a missing or zero normal fell back to its restraint flags. | Rejected. | `solver_mutation_kills.rs::inclined_support_without_normal_is_rejected` |
| The 2D and 3D cable solvers (WASM entry points) skipped input validation entirely. | They call `validate_input_2d/3d` like every other analysis. | `solver_mutation_kills.rs::cable_solver_validates_its_input` |
| The certificate's final step (`finish`, dense and sparse) would return a negative bound for a negative σ/μ; only its callers checked. | `check_sigma`/`check_mu` inside `finish` and at every entry. | `certify.rs::linear_certificate_rejects_nonpositive_or_infinite_sigma`, `sparse.rs::finish_rejects_nonpositive_or_infinite_mu` |

Not fixed, reported: with a real `rollerX` at the far end of the stayed-deck model in
`tests/integration/cable_solver.rs`, the 2D cable iteration never converges (one stay
alternates between slack and taut) and returns `converged: false`. The test keeps the
cantilevered deck it always ran (its "roller" never restrained anything).

Slow but correct (not bugs, recorded so nobody re-triages them):

- The exact 3D plastic collapse certificate runs for over 25 minutes on the 24-member
  grid-slab template. `json_plastic` keeps 3D models at 40 members for the solver and 10
  for the certificate.
- On the 232-node industrial-hall template (`ex-3d-nave-industrial`), natively in
  release: linear solve 0.02 s, linear certificate 0.06 s, P-Delta 4.6 s, P-Delta
  certificate 4.7 s, modal certificate 10.7 s, harmonic certificate 3.8 s. In the
  instrumented fuzz build these pass the 60 s timeout, which is why objects over 96
  entries are skipped. P-Delta being 200× the linear solve is worth a look.

## Running the fuzzers

Needs a nightly toolchain and `cargo install cargo-fuzz`. From `engine/`:

    cargo run --release --example fuzz_seeds
    cargo +nightly fuzz run model_certify -- -max_total_time=600 -timeout=60 -rss_limit_mb=2048
    cargo +nightly fuzz run json_static -- -max_total_time=600 -timeout=60 -fork=8

Use `-fork=N` to use N cores. A failing input lands in `fuzz/artifacts/<target>/`;
replay it with `cargo +nightly fuzz run <target> fuzz/artifacts/<target>/<file>` and
shrink it with `cargo +nightly fuzz tmin <target> <file>`. For the JSON targets the
input is two bytes then JSON: `tail -c +3 <file> | jq .` shows the model, and the first
byte modulo the number of entry points in the target's `match` picks the entry point.

To triage: reproduce the failure in a plain `#[test]` in `engine/tests` (start from the
JSON), find the root cause, fix it, and keep the test. A timeout is a finding too: either
the engine does unbounded work on that input (a bug), or the input is legitimately large,
in which case record it under *Slow but correct* above and tighten the harness caps.

CI (`.github/workflows/nightly.yml`, job `fuzz`) runs each target for 2 hours on self-hosted runners
and 30 minutes on hosted fallback runners, nightly and on manual dispatch, seeded from the templates, and uploads failing inputs as an
artifact.

## Mutation testing

`scripts/mutants.sh` runs [cargo-mutants](https://mutants.rs) over the code whose bugs
would put a wrong number in front of an engineer:

| Scope | Files |
|---|---|
| `certify` | `engine/src/certify/**` (certificate checkers, interval and exact arithmetic) |
| `solver` | `engine/src/solver/{assembly,dof,linear}.rs` (DOF numbering, stiffness and load assembly, reactions, input validation) |
| `element` | `engine/src/element/**` (element stiffness kernels) |

    scripts/mutants.sh                                  # all scopes
    MUTANTS_SCOPE=certify scripts/mutants.sh --jobs 4   # one scope
    scripts/mutants.sh --shard 3/64 --jobs 2            # extra arguments go to cargo-mutants
    cargo mutants --package dedaliano-engine -f engine/src/certify/interval.rs -- --lib

Each scope runs the library unit tests plus the integration tests that target it (listed
in the script). The end-to-end certificate tests (`certify_end_to_end*`, CERTIFY.md) run
in the `solver` and `element` scopes too: a mutant in an element kernel or in the
assembly makes the engine's `K` or `f` disagree with the independent re-assembly. Results
land in `mutants.out/`: `caught.txt`, `missed.txt`,
`timeout.txt`, `unviable.txt`. CI (`.github/workflows/nightly.yml`, job `mutants`) splits
the ~23,000 mutants into 512 shards and runs 4 of them each night, rotating with the day, so
every mutant is tested every 128 nights (docs/verification/NIGHTLY.md). A shard fails on any
missed mutant, and fails loudly if it does not finish within its time budget;
`scripts/mutants-summary.py` prints how far it got and the time per mutant. One shard by
hand: `gh workflow run nightly.yml -f only=mutants -f mutants_shards='[5]'`.

### Triaging a surviving mutant

For each line of `missed.txt`:

1. **Real gap**: the mutant changes a result an engineer would see (a stiffness term, a
   reaction, a bound, a rejection). Write a test that fails on the mutant and passes on
   the original, in the integration test file for that area, and check it kills the
   mutant: `cargo mutants -f <file> --re '<mutant text>'`.
2. **Equivalent**: the mutant cannot change any output (for example `>` to `>=` where
   equality gives the same result, or a heuristic whose failure only makes a
   certificate fail, never wrong). Add it to `exclude_re` in `.cargo/mutants.toml` with a
   one-line justification. One class is excluded automatically: an operator inside an
   index made only of integer literals whose mutated index has exactly the same value
   (`k[0 * 6 + 0]` to `k[0 * 6 - 0]` or `k[0 / 6 + 0]`). `scripts/mutants-equivalent.py`
   finds them on every run by evaluating both indices; a mutant that changes the index
   is still tested.
3. **Dead or diagnostics-only code**: timings, log text, diagnostics that do not gate a
   result. Exclude by name with the reason, or delete the code.

Never exclude a mutant that could make a result or a certificate wrong because a test is
hard to write; a hard-to-test mutant in the certificate code is exactly the one that
matters. Resource caps, search heuristics and the choice between two sound paths can be
excluded, with the reason next to the pattern.

### Last local run

RESULTS_PLACEHOLDER
