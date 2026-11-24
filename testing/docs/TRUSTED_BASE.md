# Trusted computing base of the certificates

A certificate ([CERTIFY.md](CERTIFY.md)) says "the exact answer lies in this
enclosure". This page lists everything that statement depends on: what is proved, what
is machine-checked in another way, and what is simply trusted. If any item marked
**trusted** is wrong, a certificate can be wrong.

The short version:

- **The certificates cover the f64 `K` and `f` as assembled.** They do not certify that
  `K` and `f` represent the model. Model → `K`, `f`, `M`, `K_G` is ordinary f64 code. It is
  tested (symbolic element matrices, the cross-path assembly oracle, differential tests
  against OpenSees and Code_Aster) but not certified. [testing/ROADMAP.md, "Solver and proof depth"
  item 1](../ROADMAP.md#solver-and-proof-depth), **end-to-end certificates**, is the fix: an independent interval re-assembly of
  `K` and `f` from the model JSON.
- The mathematics is proved in Lean. The Rust code that runs it is not proved to match
  the Lean algorithm. The exceptions are the bundle checkers (linear, plastic,
  combinations), whose Lean code is itself the checker that runs.
- The rounding model is IEEE 754 round-to-nearest with gradual underflow. It is checked
  where the code runs: native by tests, WASM by the specification plus a cross-browser
  bit-identity test.

## Components

| # | Component | Where | Status |
|---|---|---|---|
| T1 | **Lean kernel** (v4.34.1) and the three standard axioms `propext`, `Classical.choice`, `Quot.sound` | `verify/lean-toolchain` | trusted; nothing else is admitted (CI, below) |
| T2 | **Mathlib** at a pinned commit | `verify/lakefile.toml`, `lake-manifest.json` | trusted as definitions (the kernel checks its proofs) |
| T3 | **Abstract rounding model**: `down, up : ℝ → ℝ` with `down x ≤ x ≤ up x` | `verify/Certify/Interval.lean` | hypothesis of the Lean theorems; T4 must implement it |
| T4 | **Rust interval arithmetic**: round-to-nearest, then `next_down` / `next_up` | `engine/src/certify/interval.rs`, `sparse.rs` `prod`, the `up`/`down` helpers in each certificate module | Kani for + − × (slices) and the structure; random fma-residual tests for ÷ √ x²; **trusted** that it implements T3 for every input (see "What Kani covers") |
| T5 | **IEEE 754 binary64 in the runtime**: round to nearest-even, subnormals not flushed, no contraction into fma, correct `next_up`/`next_down` | rustc/LLVM, the CPU, the WASM engine | checked: `engine/tests/fp_environment.rs` (native), WASM spec plus `web/determinism/` (browsers) |
| T6 | **libm `pow` and `tan` within 8 ulps** | `engine/src/certify/real.rs` (design checks only) | **trusted**; on WASM this is Rust's bundled libm, the same code in every browser |
| T7 | **f64 assembly of `K`, `f`, `M`, `K_G`, `C`** from the model: element matrices, transformations, fixed-end forces, DOF numbering, releases, constraints | `engine/src/element/`, `engine/src/solver/assembly.rs`, … | **NOT CERTIFIED.** Tested only: SYMBOLIC.md, ASSEMBLY.md, the OpenSees and Code_Aster jobs, and Kani for element-level finiteness and symmetry. Roadmap item 1 |
| T8 | **Model → certificate data mapping**: which DOFs are free, which loads go in `f`, densities → `M`, the time-history load vectors, the plastic equilibrium rows and moment functionals, section → `Mp` enclosures | each `engine/src/certify/*.rs` `*_system` / traced solver entry point | **trusted** (same code path as T7) |
| T9 | **JSON parsing**: serde_json into the model in the engine; `BundleParse.lean` (Lean `Json`) in the checker | `engine/src/types/`, `verify/Certify/BundleParse.lean` | **trusted**. Fuzzed (FUZZ_MUTANTS.md). The bundle reader only maps `[m, e]` to `m·2^e` and CSC to columns, and is not proved |
| T10 | **Bundle export**: f64 → dyadic `[m, e]` (exact, round-trip checked) and canonical SHA-256 provenance | `engine/src/certify/bundle.rs`, `provenance.rs` | the conversion is checked by round trip; the hash is **trusted** and compared by `scripts/check-bundles.sh` |
| T11 | **Lean compiler and runtime** (GMP `Int`) that run `certcheck` | `lake exe certcheck` | **trusted**. `certcheck` runs compiled code, not kernel reduction. No `implemented_by`/`extern` in `Certify` (CI), so the compiled code is the code the theorems are about |
| T12 | **WASM runtime** (V8, SpiderMonkey, JavaScriptCore), wasm-bindgen glue, the JS ↔ WASM boundary | the browser | **trusted** for semantics; cross-runtime bit-identity is tested (below) |
| T13 | **The UI reading of a certificate**: which number it shows as proven | `web/src/lib/engine/certificate-read.ts`, … | **trusted** (tests) |

## Per certificate kind

"Lean" names the theorem that proves the mathematics of the check. "Runs" says what
executes the check that users get. Every kind also trusts T1–T5, T7, T8, T9 and T12; the
table lists only what goes beyond that.

| Kind | Rust (runs in the app) | Lean (proves) | Lean code runs the check? | Extra trust beyond T1–T5, T7–T9, T12 |
|---|---|---|---|---|
| **Linear static**, dense | `certify/linear.rs`: interval Cholesky of `sym(K) − σI`, residual `‖r‖₂` | `certified_error_bound`, `posDef_of_interval_cholesky`, `coercive_solution` | no | Rust ↔ Lean algorithm match |
| **Linear static**, large (Gram/Gershgorin) | `certify/sparse.rs` | `certified_error_bound_gram`, `coercive_of_gram` | **yes**, through the bundle: `Bundle.check` (`check_sound`, `check_sound_coercive`) in `certcheck` | T9 (`BundleParse`), T10, T11 |
| **Linear**, with constraints / inclined supports | `certify/constrained.rs` | coercivity and Gram steps only; the `‖C‖₂` mapping and the rotation bound are **not formalized** | no | the unformalized mapping |
| **Member forces, stations, reactions, deflections** | `certify/forces.rs`, `stations.rs`, `reactions.rs`, `deflection.rs` | `force_bound`, `abs_mulVec_sub_le`; `‖T‖₂ ≤ 1 + 4ε` is **assumed** | no | the `‖T‖` assumption; warping and shell bounds not formalized |
| **Load combinations, envelope** | `certify/combinations.rs` | `Combo.case_sound`, `check_sound_disp`, `check_sound_quantities` | **yes** (`Combo.check` in `certcheck`), for displacements; end-force case bounds come from `forces.rs` | T9–T11; per-case force bounds as above |
| **Modal** | `certify/modal.rs`: residual inclusion plus Sylvester/Finsler counting | `exists_eigenvalue_near`, `count_le_of_*`, `kahan_*` | no | positivity of the deleted principal submatrix is a hypothesis; its Gram certificate is **not connected** in Lean |
| **Buckling** | `certify/buckling.rs` | `buckling_enclosure`, `buckling_criticalFactor_mem` | no | `K_G` assembly (T7) |
| **P-Delta** | `certify/pdelta.rs`: Newton–Kantorovich with interval `J` | **not formalized** | no | the Kantorovich argument as coded |
| **Response spectrum** | `certify/spectral.rs` (modal enclosures through SRSS/CQC) | modal theorems only; the propagation is **not formalized** | no | the propagation as coded |
| **Harmonic** | `certify/harmonic.rs`: complex coercivity of `K − ω²M + iωC` | **not formalized** | no | as coded |
| **Time history** | `certify/dynamics.rs`: the discrete Newmark/HHT scheme on the traced `K`, `M`, `f_n` | **not formalized** | no | the traced system is the one integrated (T8) |
| **Plastic collapse** 2D and 3D | `certify/plastic.rs`, `plastic_3d.rs`: exact rational static and kinematic theorems; the f64 LP only proposes candidates | `Plastic.static_sound`, `kinematic_sound`, `check_sound`, `bern_bound` | **yes** (`Plastic.check` in `certcheck`) | equilibrium rows, moment functionals and `Mp` enclosures (T8); T9–T11 |
| **Design checks** (AISC, EC3, EC2, CIRSOC 201/301, ACI, NDS, AISI) | `certify/design.rs`, `real.rs`: the code formulas in interval arithmetic | interval inclusion only (`mem_add` … `mem_square`); the formulas are **not formalized** | no | T6 (libm `pow`/`tan`); that the formula is the code clause (DESIGN_EXAMPLES.md); input demand bounds from the force certificates |
| **Bundles** (`certcheck`) | export in `certify/bundle.rs`, `plastic_bundle.rs`, `combination_bundle.rs` | `Bundle.check_sound`, `Plastic.check_sound`, `Combo.check_sound_*` | **yes**: exact dyadic and rational arithmetic, no floating point | T9 (`BundleParse`), T10 (hash), T11. **Not** T3–T6: the check uses no rounding at all |

## What Lean proves, and how it is enforced

`verify/` (Lean 4.34.1, Mathlib at the commit in `lake-manifest.json`). The `lean` job
of `.github/workflows/verify.yml` builds the library and runs `scripts/check-axioms.sh`.
The script fails on:

- **unpinned versions**: `lean-toolchain` must name an exact release, the lakefile's
  Mathlib `rev` must be a tag or a commit equal to the manifest's `inputRev`, and the
  manifest must pin a commit. Mathlib's own `lean-toolchain` must equal ours;
- **`sorry`, `admit` and `native_decide`** anywhere in `Certify/`, `Certify.lean` and
  `CertCheck.lean`. `native_decide` trusts the compiler (axiom `Lean.ofReduceBool`).
  There is no use of it, so none is allowed;
- **extra axioms behind the top-level soundness theorems**: `#print axioms` for 37
  theorems (linear, Gram, bundle, interval inclusion, buckling, modal counting, Kahan,
  forces, plastic, combinations), printed in the log. Only `propext`,
  `Classical.choice` and `Quot.sound` are allowed;
- **`axiom`, `implemented_by` and `extern` in the sources** (grep), and any module under
  `Certify/` that `Certify.lean` does not import (`lake build` would not check it);
- **extra axioms anywhere in the library**: `scripts/AxiomScan.lean` walks every
  constant declared in any module under `Certify/` and in `CertCheck`, theorems and the
  executable `check` functions alike. The module list comes from the file system, not
  from `Certify.lean`'s imports, so the JSON reader `BundleParse` (imported only by
  `CertCheck` until this audit) is covered. It collects their axioms with `Lean.collectAxioms`, so a lemma left out
  of the named list cannot hide a `sorry`. It also rejects any `axiom` declaration, and
  any `@[implemented_by]` or `@[extern]`. Those would make `certcheck` run code other
  than the code the theorems are about.

Audit result (October 2026): no `sorry`, `admit`, `native_decide`, `axiom`,
`implemented_by` or `extern` in the sources. All 956 constants of the library and
`CertCheck`, 407 of them theorems, depend only on the standard three axioms. The scan was checked against a
probe module holding a `native_decide` proof and an `axiom`; it rejected both. CI runs
`scripts/test-axiom-gate.sh`. It plants an `axiom`, an `@[implemented_by]` and an
`@[extern]` in `BundleParse.lean`, and requires both the scan alone and the full gate to
reject each one. (In Lean
4.34, `native_decide` shows up as an auxiliary `axiom …native_decide.ax_*`.)

## What Kani covers

`engine/src/kani_proofs.rs`; method, timings and findings in [KANI.md](KANI.md). The
harnesses that bear on the trusted base:

- **Interval arithmetic (T4).**
  - Structure, for every finite input:
    - `interval_add_structure`, `interval_sub_structure`: each endpoint is the
      `next_down`/`next_up` of the round-to-nearest result, and overflow gives a
      non-finite interval.
    - `interval_mul_div_sqrt_square_poison_invalid`, `interval_add_sub_poison_nonfinite`:
      NaN, ±inf and reversed operands poison the result.
    - `interval_neg_exact`, `interval_mag_bounds`, `interval_square_contains_zero`.
  - Exact enclosure against integer arithmetic, on scale slices:
    - `interval_add_encloses_slice`, `interval_add_encloses_far`,
      `interval_sub_encloses_slice` (nightly);
    - `interval_mul_encloses_slice`, `certify_sparse_prod_encloses_slice`,
      `certify_sparse_prod_zero_exact`;
    - `interval_square_encloses_slice` (30-bit), `interval_div_encloses_slice` (3-bit
      divisor, nightly).
  - `dyadic_cmp_matches_ieee` validates the exact comparator the slices use.
  - Not covered by Kani:
    - √ enclosure;
    - full-width ÷ and x²;
    - × with four symbolic endpoints;
    - extension from slices to the whole range, which rests on IEEE scale invariance
      (an argument, not machine-checked).

  `interval.rs` unit tests cover these with exact fma residuals, plus
  `fp_environment.rs`.
- **Element-level properties of T7** (not correctness of the matrices):
  - `truss_*`, `frame_local_stiffness_*`, `bending_block_*`, `torsion_warping_block_ok`:
    finite, symmetric, diagonal ≥ 0;
  - `frame_transform_*`, `truss_transform_2d_structure`: block structure;
  - `compute_local_axes_3d_default_finite`;
  - `fef_*`, `adjust_fef_for_hinges*`, `expand_fef_12_to_14_ok`,
    `axial_distributed_fef_ok`: finite fixed-end forces with released moments zero where applicable. The axial harness proves the private shared integration formula over its original endpoint ranges, including reversed endpoints. Production callers must first pass the shared interval predicate; only Kani builds expose the formula through a proof shim.
  - Findings: `truss_global_stiffness_3d_symmetry_counterexample` and
    `transform_stiffness_truss_2d_symmetry_counterexample` show that `K` is not bitwise
    symmetric. This is why the certificates never assume a symmetric `K`.
- **Index plumbing around `K`**:
  - `dense_*` bounds and round-trips, `inverse_perm_inverts`;
  - `csc_from_triplets_invariants`.
- **Tool finding:** `cbmc_division_subnormal_dividend_bug`.

Kani does not prove that the Rust certificate algorithms match the Lean ones, nor any
property of `K` beyond the element level.

## Floating point where the code runs (T5)

The Lean rounding model (T3) is implemented by T4 only if every f64 operation rounds
to nearest. Audit, October 2026:

- **No contraction into fma.** rustc never emits LLVM's `fmuladd` or fast-math flags for
  plain `a * b + c`. No Cargo profile, `.cargo/config.toml` or workflow passes
  `-C target-feature=+fma`, `target-cpu=native`, `+simd128` or `relaxed-simd`. The WASM
  builds are plain `wasm-pack build --no-opt` for `wasm32-unknown-unknown`, which has no
  fma instruction. Relaxed SIMD (whose `relaxed_madd` may or may not fuse, by engine) is
  not enabled. `mul_add` appears in `engine/src/certify/` only inside `#[cfg(test)]`, as
  the exact-residual oracle (`two_prod`, the ÷/√ enclosure tests, the design scaling
  test). There it is required: it computes `a·b − p` exactly. `fp_environment.rs` checks
  that `a * b + c` is not fused at run time and scans the certificate sources and build
  configuration for `mul_add`, `*_fast` intrinsics, `algebraic_*` operations and FMA or
  relaxed-SIMD flags.
- **Rounding mode.** Nothing in the engine changes the FPU rounding mode (`fesetround`,
  `_mm_setcsr`). WASM has round-to-nearest-even only. `fp_environment.rs` checks ties to
  even, nearest above and below a tie, and correctly rounded ÷ and √.
- **Denormals.** WASM scalar f64 arithmetic must produce and consume subnormals (no
  FTZ/DAZ), and Rust does not set FTZ on native targets. `fp_environment.rs` checks
  subnormal operands and results and gradual underflow. The interval code needs no
  special case: one ulp in the subnormal range (2^-1074, absolute) still exceeds the
  half-ulp rounding error. `interval.rs` `tiny_and_huge_magnitudes` and the
  subnormal-product sweep in `fp_environment.rs` cover it.
- **`next_up` / `next_down`** (Rust `f64::next_up`/`next_down`, stable since 1.86).
  Checked: they step across ±0, the subnormal/normal boundary, binade boundaries, and to
  ±inf and ±MAX, are mutually inverse on a sweep of magnitudes, and are NaN on NaN. The
  interval code relies on `next_down(+inf) = MAX` only through the subsequent
  `is_finite` check, which rejects such an interval, and on `next_up(MAX) = inf` to
  turn an overflow into a rejected certificate.
- **Transcendentals (T6).** Only the design checks use `pow` and `tan`, widened by
  8 ulps. Natively the platform libm is used. On WASM Rust links its own libm into the
  module, so every browser runs the same code (no `Math.*` import).
- **NaN payloads.** WASM lets an engine choose the sign and payload of a generated NaN.
  The engine treats any NaN as failure and serializes it as `null`. The determinism
  test compares NaN as NaN.

## Determinism across runtimes

`web/determinism/` runs a fixed set of cases in Node and in Chromium, Firefox and WebKit
(Playwright). The cases are 9 models (5 in 2D, 4 in 3D) through the solves and
certificates: linear, bundle export, P-Delta, buckling, modal, spectral, time history,
harmonic, plastic, multi-case, and steel design. To these it adds the certificate
bundles of `verify/samples` (linear 3D, combinations, plastic 2D and 3D). Every output
is reduced to a canonical string with each float as its bit pattern. The spec asserts
that every browser's strings equal Node's. It also asserts that the Node run meets the
requirements of `checks.mjs`. Each certificate kind is read field by field: every load
case, combination and envelope of a multi-case result, and every steel member. So the
runtimes can never agree only on failed results. `checks.test.mjs` shows that each
requirement and the comparison fail when a single field or bit is flipped.
`serve.test.mjs` shows that the static server serves only its roots. CI:
the `determinism` job of `ci.yml`. Locally, from `web/` after `npm run wasm`:

    node determinism/node-run.mjs                       # per-case digests in Node
    npx playwright install chromium firefox webkit
    npx playwright test -c determinism/playwright.config.ts

The inputs are built from exact arithmetic only: JS `Math.sin` and similar functions
differ between engines. Within WASM the engine's `HashMap` seeds are fixed (no OS
randomness on `wasm32-unknown-unknown`) and timings read 0, so iteration order and time
budgets cannot differ between runs. Natively, by contrast, `HashMap` order is randomized
per process. The certificates never depend on it; only the f64 solution can differ in
the last bits.
