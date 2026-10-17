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

The JSON targets go through the same `serde_json` deserialization as `engine/src/lib.rs`,
so a malformed or hostile model file reaches the code exactly as it would from the web
app. The parameter byte sets the numeric arguments (number of modes, P-Delta iterations
and tolerance). `model_certify` builds models with valid ids, grid coordinates,
stiffnesses over twelve decades, any support layout including none, releases, springs,
settlements and nodal, distributed and point loads, so the solver runs on every input
instead of on the rare bytes that parse as JSON.

The seed corpora come from the web app's template models (`engine/tests/fixtures`):

    cd engine && cargo run --release --example fuzz_seeds   # writes fuzz/corpus/<target>/

## Properties

Checked on every input by `engine/fuzz/src/lib.rs`:

1. **No panic.** Bad input returns `Err`; libFuzzer aborts on a panic.
2. **Bounded work.** Inputs whose work knobs exceed caps (time steps, iterations,
   subdivisions, arrays over 512, objects over 96 entries) are skipped before solving,
   and libFuzzer's `-timeout` catches the rest.
3. **Finite results.** Every number in an `Ok` result is finite, except fields that
   document +∞ (`ALLOWED_NON_FINITE`: `relBound`, `omega2Upper`, `uniquenessRadius`,
   `bimoment` of combined force bounds, `b2Factor` with `isStable: false`). The check
   walks the result with a serde serializer, because `serde_json` writes NaN and ±∞ as
   `null`.
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

CI (`.github/workflows/verify.yml`, job `fuzz`) runs each target for 30 minutes nightly
and on manual dispatch, seeded from the templates, and uploads failing inputs as an
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
    scripts/mutants.sh --shard 3/8 --jobs 2             # extra arguments go to cargo-mutants
    cargo mutants --package dedaliano-engine -f engine/src/certify/interval.rs -- --lib

Each scope runs the library unit tests plus the integration tests that target it (listed
in the script). Results land in `mutants.out/`: `caught.txt`, `missed.txt`,
`timeout.txt`, `unviable.txt`. CI (job `mutants`, sharded 8 ways) runs nightly and fails
on any missed mutant.

### Triaging a surviving mutant

For each line of `missed.txt`:

1. **Real gap**: the mutant changes a result an engineer would see (a stiffness term, a
   reaction, a bound, a rejection). Write a test that fails on the mutant and passes on
   the original, in the integration test file for that area, and check it kills the
   mutant: `cargo mutants -f <file> --re '<mutant text>'`.
2. **Equivalent**: the mutant cannot change any output (for example `>` to `>=` where
   equality gives the same result, or a heuristic whose failure only makes a
   certificate fail, never wrong). Add it to `exclude_re` in `.cargo/mutants.toml` with a
   one-line justification.
3. **Dead or diagnostics-only code**: timings, log text, diagnostics that do not gate a
   result. Exclude by name with the reason, or delete the code.

Never exclude a mutant because a test is hard to write; a hard-to-test mutant in the
certificate code is exactly the one that matters.

### Last local run

RESULTS_PLACEHOLDER
