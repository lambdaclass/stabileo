# Testing roadmap

This roadmap covers prevention, soundness, verification, solver proofs, and CI feedback.
[PRODUCT_ROADMAP, “Priority now” item 6](../docs/roadmap/PRODUCT_ROADMAP.md#priority-now)
still holds the overall order. The database-style checks listed in that item are the next
testing work.

### Prevention: fewer safety problems (2026-10-30)

What found the wrong results so far: the invariance (metamorphic) tests (#758, #760, #762), fuzzing
(#741), a mass-orthogonality check (#759) and the research benchmarks. Prevention is doing more of
what works, all the time, and making every test trustworthy. Started 2026-10-29; progress below.

| # | Item | Why | Workstream |
|---|---|---|---|
| 1 | **Every result checks itself before it is shown.** Statics: reactions balance the loads, small residual. Modal: mass-orthogonal modes and per-mode residual. Buckling: factor equals the mode's Rayleigh quotient. Time history: energy balance, reciprocity spot check. Nonlinear: the reported load factor's residual is below tolerance. Plastic collapse: mechanism equilibrium. A failed check warns or refuses (containment) instead of showing a number. | Turns unknown wrong results into visible refusals; would have caught #759, #760, #432, #433 at runtime | slice 1: PR [#865](https://github.com/lambdaclass/stabileo/pull/865), in review |
| 2 | **Invariance tests on every analysis type and the whole model corpus:** renumbering, member direction, units, rigid motion, mirror symmetry, E scaling, superposition, reciprocity. Fast subset on every PR; exhaustive tier nightly. | Needs no reference values; found three of the worst bugs | suite PR [#813](https://github.com/lambdaclass/stabileo/pull/813) merged; everywhere slice 1 (stiffness scaling, six analyses): PR [#860](https://github.com/lambdaclass/stabileo/pull/860), merged into the stacked branch, still to reach main |
| 3 | **Units in the type system (#359)** — crucial: zero-cost unit types in Rust at the engine boundary first (wire format and results unchanged), then inward; branded TypeScript types at the UI → engine boundary; mixing units is a compile error. | Removes a whole class of bugs (#758 and #762 depend on units) | slice 1: PR [#864](https://github.com/lambdaclass/stabileo/pull/864), in review; crucial |
| 4 | **Trustworthy benchmarks** (the test-correctness program below) | A wrong test cries wolf or, worse, passes a wrong engine | slice 1: PR [#862](https://github.com/lambdaclass/stabileo/pull/862), merged; test fixes: PR [#1056](https://github.com/lambdaclass/stabileo/pull/1056), open (48 wrong references fixed; found #1057) |
| 5 | **New analysis types ship as experimental** (labelled, contained) until they have self-checks, invariance tests and two-source benchmarks. | Nothing new reaches users unverified | next |
| 6 | **Nightly bug hunting on our own runners** (self-hosted runners, idle at night): random models through the invariance tests, differential runs (OpenSees, Code_Aster), fuzzing at high case counts; each distinct finding opens its own issue with the seed and a minimal model. Trusted events only. | Bugs found by the machine at night, not by users | PR [#861](https://github.com/lambdaclass/stabileo/pull/861), merged 2026-10-30 |
| 7 | **Mutation gate on changed engine code:** a PR may not add surviving mutants in the engine code it touches; the backlog (#745–#752, ~1,960 mutants) is cleared in parallel. | Stops test gaps from growing | next |

**Test-correctness program (item 4).** Four suspected engine bugs across [#845](https://github.com/lambdaclass/stabileo/issues/845),
[#846](https://github.com/lambdaclass/stabileo/issues/846), [#810](https://github.com/lambdaclass/stabileo/issues/810) and the earlier investigations were test-model errors.
Keep the independent-solver triage rule. Every benchmark must therefore:

1. **Be a spec, not a hand-built model:** a data file (geometry, material, supports, symmetry planes,
   loads, measured quantity, each with source, page and table) turned into a model by one shared,
   tested generator.
2. **Have two independent references that agree before it is admitted:** the paper's value and an
   exact solution, a textbook formula or an independent program (OpenSees, Code_Aster, CalculiX) on
   the same spec.
3. **Pass automatic model checks before any comparison:** total applied load equals the analytic value;
   reactions balance the loads; a symmetric quarter model matches the full model; exactly the expected
   rigid-body modes.
4. **Show convergence, not one mesh:** three or more meshes, the error must shrink, and a Richardson
   estimate of the converged value is compared. A plateau or a growing error flags the model or the
   reference, not the engine.
5. **Triage by an independent solver:** Stabileo and OpenSees agree but miss the reference → suspect
   the reference or model; they disagree → suspect the engine.
6. **Prove it can fail:** mutants of the engine must make it fail; a benchmark that passes a broken
   engine (e.g. absolute-value comparisons) tests nothing. Signed quantities always.
7. **Justify every tolerance** from the convergence study or the reference's precision, written next
   to it; provisional references are informational only, never pass/fail.
8. **Reference audit in review:** numbers checked against the source text page by page; a CI lint
   rejects a benchmark without spec, two references, model checks or convergence study.
PR [#1056](https://github.com/lambdaclass/stabileo/pull/1056) applied rules 6 and 7 to the existing suite: strictly relative comparisons exposed
48 wrong references or models, and fixing the twisted beam's units turned a documented "locking"
into a real engine finding ([#1057](https://github.com/lambdaclass/stabileo/issues/1057)).
Every investigation keeps a written numbers report (e.g. docs/audits/810-mitc4-curved-shells.md), so a
real engine bug is never waved off as a test problem either.

Further, to make the tests themselves trustworthy:

9. **Double-entry specs:** two agents build each benchmark spec independently from the paper text,
   without seeing each other's work, and the specs must match field by field before admission. Modelling
   slips (an extra support, a missing symmetry, a frame for a truss) rarely survive two independent builds.
10. **One source of truth per reference,** shared by the engine tests, the research pages and the
    verification manual; a check fails if any copy differs, so a correction reaches every place at once
    (on 2026-10-29 the shell obstacle course page still carried the models the engine test had fixed).
11. **Independent engineer sign-off on the core reference set** (the ~30 classic benchmarks most trust
    rests on), extending #450 from design checks to analysis benchmarks.
12. **Skipped tests expire:** every test ignored as a known wrong result names its issue and a review
    date; past the date it fails CI, so known failures cannot sit unnoticed.
13. **Allow last-ulp differences:** fixture and JSON comparisons must allow the last-ulp differences
    between macOS and Linux libm (PR [#859](https://github.com/lambdaclass/stabileo/pull/859)).
14. **Test refusals as refusals:** when containment withholds a result, the page must say so and its
    checks must assert that refusal, not fail because a number is absent.

### Soundness multipliers

The step changes in what a result can be trusted for, beyond more tests of the same kind. Each
builds on what exists: metamorphic testing on the corpus ([testing/ROADMAP.md, Trust item 1](ROADMAP.md#trust-and-verification-backlog)), discretization estimates
([testing/ROADMAP.md, Trust item 6](ROADMAP.md#trust-and-verification-backlog)), independent clause implementations ([testing/ROADMAP.md, Trust item 3](ROADMAP.md#trust-and-verification-backlog)), Rust–Lean correspondence in
general terms ([testing/ROADMAP.md, Trust item 8](ROADMAP.md#trust-and-verification-backlog)), end-to-end certificates and a second checker (Solver and proof
depth items 6 and 10), design-check properties (item 2) and validation against experiments (item 8).

1. **Check the user's own model on every solve.** [#498](https://github.com/lambdaclass/stabileo/issues/498) Verification runs on our corpus; the bugs that hurt live in users' models. After each solve, in the background: global equilibrium recomputed from the model's loads, not from `K`; a rotated and renumbered twin of the model, solved and compared (the check that found [#488](https://github.com/lambdaclass/stabileo/issues/488) and the batch-3 interactions); an independent re-assembly of `K` and `f` ([#403](https://github.com/lambdaclass/stabileo/pull/403)) compared entry by entry. On any disagreement the result is not shown as verified, and the reason is. "We tested similar models" becomes "this model was cross-checked".
2. **Contradictory input refused, never resolved silently.** [#504](https://github.com/lambdaclass/stabileo/issues/504) A rigid restraint and a spring on the same DOF made the engine pick the spring ([#488](https://github.com/lambdaclass/stabileo/issues/488)); every such pair of fields in the input is refused by name.
3. **The Rust kernels proved against the Lean algorithm.** [#500](https://github.com/lambdaclass/stabileo/issues/500) The main unproved link in [TRUSTED_BASE.md](docs/TRUSTED_BASE.md): translate the critical kernels (element matrices, transformations, fixed-end forces, certificate checks) to Lean with Aeneas/Charon and prove them, starting with the frame element and the linear certificate.
4. **Guaranteed bounds on discretization error.** [#501](https://github.com/lambdaclass/stabileo/issues/501) For shells, plates and solids the mesh error dominates and only estimates exist (`engine/src/postprocess/discretization/` is currently ZZ-SPR with `certified: false`). Equilibrated-flux reconstruction (local vertex-patch problems yielding a statically admissible stress field) gives a Prager–Synge guaranteed upper bound on the energy-norm error in linear elasticity — short enough to formalize in Lean — and pairs with Dual-Weighted Residual (adjoint) goal-oriented refinement: "the true continuous solution is within ±x", not only "the discrete solve is accurate".
5. **Certificates for nonlinear analyses.** [#502](https://github.com/lambdaclass/stabileo/issues/502) Co-rotational, material-nonlinear and fiber analyses are Benchmarked only; certify the converged equilibrium state (residual inclusion with an interval tangent from `Dual<f64>` / exact consistent tangents, Newton–Kantorovich as for P-Delta).
6. **The remaining certificate kinds formalized in Lean.** [#503](https://github.com/lambdaclass/stabileo/issues/503) P-Delta, response-spectrum propagation, harmonic, time history, the constraint mapping, the modal positivity hypothesis, and Prager–Synge equilibrated-flux PDE bounds.
7. **Proof-carrying results and offline browser verifier (`verify.stabileo.com`).** [#499](https://github.com/lambdaclass/stabileo/issues/499) Every certified result and `Memoria de Cálculo` carries a QR code and certificate bundle, and the independent verifier (`certcheck`) runs offline in the browser as a small WASM module (<150 KB): a reviewer, municipality, insurer, or client verifies bounds, input-to-report integrity, and live safety-advisory status without trusting the solver. The trusted base shrinks to the checker and the bundle parser. See [`high_leverage_solver_and_product_plan.md`](../docs/research/high_leverage_solver_and_product_plan.md#wave-2--zero-switching-cost-distribution--trust-wedges-roadmap-multipliers).
8. **A public bug bounty for wrong results.** [#505](https://github.com/lambdaclass/stabileo/issues/505) Paid, reproducible wrong or unconservative results, by the severity scale of [SAFETY_ADVISORIES.md](../docs/SAFETY_ADVISORIES.md); each accepted report gets a regression test, a postmortem and, where it applies, an advisory. Alongside the independent licensed engineer's review of defined workflows (findings published) and the corpus of real anonymised projects (Trust backlog, "Beyond software").

**Exit criteria (Soundness multipliers).**
- Every linear static and modal solve in the app runs the per-model cross-checks (item 1); disagreements are 0 on the example and acceptance corpus, and each one seen in the field is a triaged issue.
- Every certified result can be exported as a bundle and verified in the browser by the Lean checker (item 7).
- The frame element and the linear certificate are proved in Lean through Aeneas (item 3); every certificate kind in TRUSTED_BASE.md is formalized or listed with the step that is not (item 6).
- Guaranteed discretization bounds are shown for linear MITC4/MITC9 plates and shells (item 4).
- Co-rotational analysis is Certified in MATURITY.md (item 5).
- The engine refuses every contradictory field pair found by the input audit (item 2); the bug bounty is published with its scope and rules (item 8).

**Metrics** (on the [dashboard](docs/DASHBOARD.md)): share of solves with per-model cross-checks and their disagreements; certified results exportable as bundles; kernels proved through Aeneas; certificate kinds formalized; bug-bounty reports received, accepted and fixed.

### Trust and verification backlog

What remains after the October 2026 safety wave (certified solver, differential testing against seven solvers, fuzzing and mutation testing, feature matrix, certified design checks, model sanity review). Each item closes a way results can still be silently wrong or a way verification can silently stop working.

1. **Physics invariants on every model (metamorphic testing).** [#358](https://github.com/lambdaclass/stabileo/issues/358) (PR [#332](https://github.com/lambdaclass/stabileo/pull/332)) Rigid rotation, mirroring, node renumbering and unit scaling leave physical results unchanged; superposition and Maxwell–Betti reciprocity hold for linear analyses; external work equals strain energy. Run across all analyses and the whole example corpus; no reference solution needed.
2. **Variant analysis after every bug.** [#448](https://github.com/lambdaclass/stabileo/issues/448) After each confirmed bug, search the codebase for the same bug class and add a check that catches the class, not only the instance. Classes seen so far: frame / rotation / sign conventions (#435, #418, #419), unit conversions (#423), double counting, NaN or degenerate input accepted (#335, Lb = 0, zero capacity passing), silent drops (constraints on supported nodes, member couples #343, features an analysis ignored). Each fix records the class, the search, other instances found and the class-level check added (lint, property test, metamorphic invariant, feature-matrix cell, fuzz property).
3. **Clause traceability enforced in CI, and independent implementations.** [#360](https://github.com/lambdaclass/stabileo/issues/360) A machine-readable map clause → implementation → tests → published example; CI fails when a clause has no test. The most-used checks (CIRSOC 201, CIRSOC 301) get a second implementation written from the clause text alone, compared on random inputs.
4. **Every new check ships with a negative case.** [#451](https://github.com/lambdaclass/stabileo/issues/451) Every new design check, test, certificate check, CI gate or alert comes with an input or mutation that must make it fail, run in CI; the existing gates are audited once for the same.
5. **Textbook example library.** [#450](https://github.com/lambdaclass/stabileo/issues/450) Hundreds of solved problems from standard texts (Hibbeler, Kassimali, McCormac, Gere and similar) as automated engine tests: printed inputs, printed answers as references at the printed precision, a citation per case. Small and many, unlike the building-scale acceptance suite (Coverage item 6); unlike `engine/tests/reference/`, they call the engine.
6. **Discretization error.** [#356](https://github.com/lambdaclass/stabileo/issues/356) (PR [#327](https://github.com/lambdaclass/stabileo/pull/327)) Certificates bound the algebraic error of the discretized model, not the mesh error. A posteriori estimators (e.g. Zienkiewicz–Zhu) for shells, plates and solids, automatic convergence checks, and a discretization-error estimate shown next to every certified result.
7. **Units in the type system.** [#359](https://github.com/lambdaclass/stabileo/issues/359) Tracked once as [testing/ROADMAP.md, Prevention item 3](ROADMAP.md#prevention-fewer-safety-problems-2026-10-30) (and Priority now item 12): kN/N and m/mm mix-ups fail to compile instead of producing wrong numbers.
8. **More formal proofs.** [#364](https://github.com/lambdaclass/stabileo/issues/364) More kernels proved in Lean, and machine-checked correspondence between the Rust implementation and the proved algorithm for the critical kernels.
9. **Verification jobs that actually run.** [#354](https://github.com/lambdaclass/stabileo/issues/354) (PR [#326](https://github.com/lambdaclass/stabileo/pull/326)) Nightly fuzzing, mutation testing and the Code_Aster / OpenSees / Frame3DD / PyNite / Mystran / Kratos / CalculiX differential jobs run on schedule, and a failure alerts someone (issue or notification). A job that never runs protects nothing.
10. **Protected main.** [#355](https://github.com/lambdaclass/stabileo/issues/355) Required checks (engine, web, e2e, Kani, Lean, symbolic) before merge; CODEOWNERS so solver, certificate and design-check changes need a second reviewer.
11. **Re-check prompt for old projects.** [#361](https://github.com/lambdaclass/stabileo/issues/361) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) When a saved project opens in a version whose results changed for its features, say what changed and offer to re-run. *In progress (#328): registry of result changes, solve stamps, blocking notice, stale marking — `testing/docs/PROVENANCE.md`.*
12. **Reproducibility and provenance.** [#362](https://github.com/lambdaclass/stabileo/issues/362) (PR [#328](https://github.com/lambdaclass/stabileo/pull/328)) Every report records the version, commit and certificate hashes, so anyone can reproduce it bit for bit. *In progress (#328): provenance block in every report, reproduce dialog and CLI, determinism fixes and test — `testing/docs/PROVENANCE.md`.*
13. **Result badges use the verification maturity levels.** [#440](https://github.com/lambdaclass/stabileo/issues/440) Every result and design-check row shows its level from [MATURITY.md](docs/MATURITY.md) (Certified > Benchmarked > Differential > Tested > Unverified), read from `testing/docs/dashboard.json` at build time so the badge cannot drift from the matrix; an open `safety` issue affecting the item is shown with it.
14. **Sensitivity to assumptions.** [#357](https://github.com/lambdaclass/stabileo/issues/357) How much governing results move when uncertain assumptions change (support fixity, cracked-section stiffness modifiers $I_{\text{eff}}$, soil spring values $k_s$, connection rigidity), computed via zero-Monte-Carlo exact adjoint sensitivities + interval bounds ([PRODUCT_ROADMAP.md, Solver performance and capability item 3](../docs/roadmap/PRODUCT_ROADMAP.md#solver-performance-and-capability)), so engineers see which assumptions actually threaten safety.
15. **Opt-in field telemetry.** [#363](https://github.com/lambdaclass/stabileo/issues/363) Solver refusals, diagnostics and crashes from real use (opt-in, no model content without consent), to learn how real models fail.
16. **Performance and scale regression tracking.** [#365](https://github.com/lambdaclass/stabileo/issues/365) Solve time, memory, iteration counts and sparse/dense crossover tracked per release on the benchmark and acceptance models (docs/VERIFICATION.md layer 8), with a failing gate on large regressions.

Beyond software: an independent licensed structural engineer reviews worked examples, clause readings and sample reports; real anonymised projects from engineering firms (with their SAP2000/ETABS/RFEM models and results, and the architect's IFC/DWG where available) join the acceptance suite and the BIM-import corpus; the design-code manuals with worked examples (AISC Design Examples, INTI/CIRSOC example books, AWC NDS, TMS 402, AISI Cold-Formed Steel Design Manual) are obtained so checks are tested against published numbers rather than hand-worked ones.

**From the verified review (2026-11-02), P1:**

- **Mutation rotation that keeps its promise:** done by [#1240](https://github.com/lambdaclass/stabileo/pull/1240) (32 shards a night, every shard every 16 days);
  the weekly staleness check stays red until 16 nights of markers exist.
- **The TypeScript model rewrite before the solve is outside verification** (offsets, semi-rigid
  joints, variable members, 2D-in-3D): the differential, fuzz and metamorphic harnesses call Rust
  directly and never exercise it. Move it to Rust (not covered by #731 or #392, which are after the
  solve).

**Exit criteria (Trust and verification).**
- Every verification job (nightly fuzzing per target, Rust mutation testing, the seven differential harnesses, Lean, Kani, symbolic) runs on `main` at least weekly, publishes its numbers as a CI artifact read by the [dashboard](docs/DASHBOARD.md), and a failure opens an issue; no Trust metric reads "not yet measured".
- 0 untriaged differential mismatches: every mismatch in the latest run per harness is a fixed bug, a known open issue, or a documented modelling difference.
- `main` is protected with the required checks and CODEOWNERS (item 10).
- Every certified shell, plate and solid result shows a discretization-error estimate (item 6).
- Physics invariants (item 1) run on 100 % of the example and acceptance corpus with 0 violations.
- The result badges (item 13) show the MATURITY.md level on 100 % of result views and design-check rows.
- Variant analysis (item 2): 100 % of bugs closed after it lands have a variant-analysis note; every bug class listed has at least one class-level automated check in CI.
- Textbook library (item 5): at least 300 solved problems, at least 20 per analysis family that textbooks cover, each citing its source, 0 failing.
- Negative cases (item 4): 100 % of checks, tests and gates added after it lands have a negative case, and every existing gate has one after the audit.

**Metrics** (all on the [dashboard](docs/DASHBOARD.md)): differential models compared, agreeing and mismatching per harness; fuzz executions per night; share of analyses and of design checks that are Certified (MATURITY.md); open `safety` issues; `roadmap:verification` issues closed; textbook problems in the library and bug classes with a class-level check ("not yet measured" until items 2 and 5 land).

### Solver and proof depth

Closing the gap between "proven" and "right".

**Proofs follow the code.** Every proof and property item in this backlog, including
[#364](https://github.com/lambdaclass/stabileo/issues/364) ([testing/ROADMAP.md, Trust item 8](ROADMAP.md#trust-and-verification-backlog)), [#375](https://github.com/lambdaclass/stabileo/issues/375) and [#376](https://github.com/lambdaclass/stabileo/issues/376) below, and [#500](https://github.com/lambdaclass/stabileo/issues/500) and
[#503](https://github.com/lambdaclass/stabileo/issues/503) (Soundness multipliers), follows the rules in item 1: checks live in the engine crate next
to the Rust they cover, Lean statements are generated from that Rust or linked to it, all run as
required CI checks, and each names the function it covers.

1. **Formal checks for the design and load layer** (2026-11-15), each added as the code moves to
    Rust (Priority now item 13):
    - **Tied to the Rust code, so they never go stale:** every property check (Kani harnesses,
      proptest properties, symbolic tests) lives in the engine crate next to the code it checks, not
      in a separate model; a result is called proved for the Rust code only when the Lean statement is
      about that code, generated from it (for example with Aeneas/Charon) or linked to it by a
      machine-checked correspondence proof; correspondence tests that fail when the Rust function
      changes are supporting evidence, not a proof, and a hand-written Lean copy is never labelled
      as proving the Rust; all of them run as required CI
      checks, so a change that breaks a property or invalidates a proof fails the pull request; each
      check names the Rust function it covers, and a CI lint fails when a covered function is
      renamed or removed without its check being updated.
    - **Bounded arithmetic is sound:** every operation of the shared rounding layer encloses the
      exact real result, proved in Lean and checked on the Rust implementation with Kani. Rounding
      errors caused many earlier advisories.
    - **Design input completeness:** a verdict covers every combination, member and declared
      station, or refuses; proved over the dispatcher with Kani
      ([#2096](https://github.com/lambdaclass/stabileo/issues/2096) class).
    - **Concurrent demands by construction:** a demand tuple (N, M, V, T) can only be built from a
      single combination and station, enforced by types
      ([#1316](https://github.com/lambdaclass/stabileo/issues/1316) class).
    - **Load generation invariance:** generated loads do not change with mesh subdivision or
      labels; gravity-type loads such as snow do not change with plan orientation; for wind and
      seismic, rotating the building together with the load direction rotates the load components
      accordingly. Proved for snow and wind on the supported roof shapes ([#2093](https://github.com/lambdaclass/stabileo/issues/2093),
      [#2144](https://github.com/lambdaclass/stabileo/issues/2144) class).
    - **Result recovery is exact:** recovered member displacements and forces equal the closed-form
      beam solution for every supported load type, including concentrated couples, checked
      symbolically ([#2143](https://github.com/lambdaclass/stabileo/issues/2143) class).
    - **Code clause limits and Executable Design-Code IR:** each implemented clause is authored once as a unit-typed expression AST generating f64 evaluation, outward-rounded interval certification, step-by-step Memoria traces (zero engine-vs-report drift), and boundary tests on both sides of every limit, checked against an independent machine-readable statement of its formula and limits ([#2142](https://github.com/lambdaclass/stabileo/issues/2142) class).
    - **Physical-IR conservation and lowering invariants:** every lowering pass from the canonical Physical IR to the analytical FEM mesh preserves total force and moment (`∫ p dA == Σ f_i`, `∫ r × p dA == Σ r_i × f_i`) and leaves physical load generation and rebar cutoffs invariant under remeshing, subdivision, rotation and member reversal.
    - **Monotonicity** ([#378](https://github.com/lambdaclass/stabileo/issues/378), item 2) proved
      rather than sampled once the checks are in Rust, each with its variables, domain and
      assumptions stated, since not every intuitive monotonicity holds (more axial compression can
      raise RC moment resistance).
    - **Units in types** ([#359](https://github.com/lambdaclass/stabileo/issues/359); Prevention
      item 3), so mixing units fails to compile.
2. **Properties of the design checks,** [#378](https://github.com/lambdaclass/stabileo/issues/378) proved or exhaustively tested, each property with its variables, domain and assumptions stated: for example, scaling all demands of one combination proportionally with the section and material fixed never lowers the utilization ratio; more tension reinforcement or a larger section within one failure mode never lowers capacity; φ within its code limits. Not every intuitive monotonicity holds: more axial compression can raise RC moment resistance.
3. **Documented, peer-reviewed element derivations** [#384](https://github.com/lambdaclass/stabileo/issues/384) (PR [#330](https://github.com/lambdaclass/stabileo/pull/330)) in `docs/SOLVER_REFERENCE.md`: each formulation's derivation and assumptions, reviewable by an independent engineer. The review's findings are issues [#406](https://github.com/lambdaclass/stabileo/issues/406)–[#433](https://github.com/lambdaclass/stabileo/issues/433) (label `derivations`); several are `safety`.
4. **Nonlinear and dynamic robustness:** [#381](https://github.com/lambdaclass/stabileo/issues/381) convergence criteria audited (force, displacement, energy norms), load-step and time-step sensitivity tests, energy-drift monitoring in time history, path following past limit points.
5. **Numerical stress tests:** [#382](https://github.com/lambdaclass/stabileo/issues/382) extreme stiffness ratios, ~10⁶-DOF models, near-singular and unit-extreme models; measure where accuracy degrades and refuse beyond it.
6. **End-to-end certificates.** [#375](https://github.com/lambdaclass/stabileo/issues/375) (PR [#403](https://github.com/lambdaclass/stabileo/pull/403)) Today a certificate proves the solution of the f64 `K` and `f` as assembled, not that they represent the model. An independent checker re-assembles `K` and `f` from the model JSON in interval arithmetic from closed-form element formulas (frames first, then shells), so a certificate covers model → K → result. *Frames and trusses (2D and 3D) done: `endToEnd` on the linear certificate, [CERTIFY.md](docs/CERTIFY.md#end-to-end-certificates); shells, connectors, curved beams and warping next.*
7. **Convergence-order tests (method of manufactured solutions)** [#380](https://github.com/lambdaclass/stabileo/issues/380) for every shell, plate and solid element: the observed rate matches the theory.
8. **Validation against physical experiments,** [#379](https://github.com/lambdaclass/stabileo/issues/379) not only verification: published laboratory tests (RC beams and columns, shake-table frames, Vecchio–Collins panels, connection tests) for the nonlinear material models (concrete, fiber sections, plastic hinges, contact), following ASME V&V 10 / NAFEMS practice.
9. **Trusted computing base, audited and enforced.** [#376](https://github.com/lambdaclass/stabileo/issues/376) (PR [#334](https://github.com/lambdaclass/stabileo/pull/334)) No `sorry` and no extra axioms in Lean (`#print axioms` in CI), pinned Lean/mathlib; a document listing everything a certificate assumes; the IEEE rounding the proofs model checked where the code runs (no fast-math or unexpected FMA, identical WASM results across Chrome, Firefox and Safari).
10. **A second, independent certificate checker** [#377](https://github.com/lambdaclass/stabileo/issues/377) (e.g. MPFR or exact rationals) beside the Lean one; agreement of two independently written checkers.
11. **Engine code hygiene:** [#383](https://github.com/lambdaclass/stabileo/issues/383) line and branch coverage per module (llvm-cov), Miri for any `unsafe`, strict clippy, overflow checks on index arithmetic, `cargo audit` in CI.

**From the verified review (2026-11-02), P1:**

- **Every nonlinear exit passes an equilibrium gate:** only `linear.rs` fills `equilibrium`; P-Δ
  leaves it empty; [#432](https://github.com/lambdaclass/stabileo/issues/432) contact freezes a chattering gap and reports converged; [#433](https://github.com/lambdaclass/stabileo/issues/433)
  fiber returns the last iterate; the `solve_cable_2d` export drops `converged`. Contact and fiber
  are not called by the web app, so this is P0 for direct engine callers (partly [#381](https://github.com/lambdaclass/stabileo/issues/381), [#370](https://github.com/lambdaclass/stabileo/issues/370)).
- **[#458](https://github.com/lambdaclass/stabileo/issues/458) proof gap:** `EndToEnd.lean` leaves element formulas and the removal of unstiffened
  DOFs unformalised (partly [#375](https://github.com/lambdaclass/stabileo/issues/375), [#376](https://github.com/lambdaclass/stabileo/issues/376), [#500](https://github.com/lambdaclass/stabileo/issues/500)).
- **Cb moves from TypeScript (`steel/moment-gradient.ts`) to Rust** ([#391](https://github.com/lambdaclass/stabileo/issues/391)): part of Priority now item 13.

**Exit criteria (Solver and proof depth).**
- Every Certified analysis is certified end to end for frames (model → K, f → result), then for shells (item 6); the trusted computing base is a reviewed document enforced in CI, with 0 `sorry` and no extra axioms in Lean (item 9).
- Every element family in MATURITY.md is Certified (symbolic derivation) or Benchmarked, and every shell, plate and solid passes a convergence-order test (item 7); 0 open `derivations` issues labelled `safety`.
- Rust mutation testing covers all shards at least every 16 days with 0 missed mutants outside the documented equivalents (`.cargo/mutants.toml`).
- Engine coverage (llvm-cov) measured on every release; targets: line coverage at least 85 % and branch coverage at least 75 % in `engine/src/{solver,element,certify}`, with every uncovered region in `certify/` justified.
- Numerical stress tests define the accuracy limits, and the engine refuses models beyond them (item 5).

**Metrics** (on the [dashboard](docs/DASHBOARD.md)): Rust mutation score (cargo-mutants) and the share of mutants tested; engine line and branch coverage; Lean theorems, Kani harnesses and engine tests; element families by maturity level; `roadmap:solver-proofs` issues closed.

### CI and feedback loop (2026-11-04)

Every fix waits on CI; on 2026-11-01 about 40 PRs were in CI at once, and the merge queue stalled for
hours on hung self-hosted runners, a shared sccache server and GitHub cache rate limits. A fast,
reliable queue is a safety item: a fix that cannot land leaves the wrong result live. Owner: the CI
workstream (W2-ci).

**Speed:** push to green on a full-scope pull request went from 397–498 min to 51–72 min after the
CI speed PRs of 2026-11-03 and 2026-11-04 (four threads per job [#1330](https://github.com/lambdaclass/stabileo/pull/1330), artifact 5xx retry [#1331](https://github.com/lambdaclass/stabileo/pull/1331), E2E shards
on GitHub's runners [#1332](https://github.com/lambdaclass/stabileo/pull/1332), hybrid PR routing [#1333](https://github.com/lambdaclass/stabileo/pull/1333), per-crate research WASM cache [#1334](https://github.com/lambdaclass/stabileo/pull/1334), no rerun on
a label [#1336](https://github.com/lambdaclass/stabileo/pull/1336), queue route budgets against the group's base [#1337](https://github.com/lambdaclass/stabileo/pull/1337), no second test of a merge to main
[#1339](https://github.com/lambdaclass/stabileo/pull/1339), no wall-clock assertions in the shared suite [#1340](https://github.com/lambdaclass/stabileo/pull/1340), runner pool drift alert [#1327](https://github.com/lambdaclass/stabileo/pull/1327)), then the shorter builds and runner isolation of items 19 and 20 (landed 2026-11-04).
In flight: [#1373](https://github.com/lambdaclass/stabileo/pull/1373), and item 21.

**Faster feedback (2026-10-30):** self-hosted CI runners merged (PR [#854](https://github.com/lambdaclass/stabileo/pull/854)), and the merge
queue is live. In review: fast PR checks that run what a change touches (PR [#863](https://github.com/lambdaclass/stabileo/pull/863)), build
WASM once and retry only infrastructure errors (PR [#866](https://github.com/lambdaclass/stabileo/pull/866)), and e2e guards including a 45 s
smoke budget (PR [#869](https://github.com/lambdaclass/stabileo/pull/869)). Browser checks run on self-hosted runners.

**Route sizes (2026-11-04, [#1390](https://github.com/lambdaclass/stabileo/pull/1390)):** the per-PR route byte budget and its one-time acceptances are gone, at the user's direction: a PR reports its landing and app growth and never fails for size, and the weekly Route size workflow opens or updates a `route-size` issue when main passes the ceilings in `web/scripts/route-size-ceilings.json` (set on 2026-11-04 from the safety integration [#1409](https://github.com/lambdaclass/stabileo/pull/1409) with [#1406](https://github.com/lambdaclass/stabileo/pull/1406), about 8 % headroom). Research isolation keeps blocking: a change touching research code shipped to the browser may grow a route by 128 B at most, and a research module in a product chunk fails. The gate counts what the app loads lazily, except behind a declared route boundary (the blog, [#1289](https://github.com/lambdaclass/stabileo/pull/1289); the course, [#1302](https://github.com/lambdaclass/stabileo/pull/1302)). The safety batch landed as one integration ([#1409](https://github.com/lambdaclass/stabileo/pull/1409), results versions 17 to 26) under its one-time budget, the last one. It carries [#1253](https://github.com/lambdaclass/stabileo/pull/1253)'s generated-load re-check notice with its texts in six locales; [#1406](https://github.com/lambdaclass/stabileo/pull/1406) adds German, French and Turkish to every registry entry so the re-check notice ([#1404](https://github.com/lambdaclass/stabileo/issues/1404)) is readable in all six languages, and that text loads only with the notice, outside the static app closure.

| # | Item | Why | PR | State |
|---|---|---|---|---|
| 1 | **14 runners in pools, with a watchdog:** label pools (queue/main, same-repo PRs, timing-sensitive jobs pinned, nightly), and a watchdog that restarts a runner GitHub shows busy with no live job | Six runners hung "busy" with no job blocked the queue for hours twice on 2026-11-02 | with #1221 | eight runners not registered yet: **waits on the user** (remote registration command in the ledger) |
| 2 | **One sccache server per runner user:** private Unix socket per runner; build without sccache when it cannot start | Runners sharing one sccache port failed merge-group WASM builds with "Permission denied" | [#1075](https://github.com/lambdaclass/stabileo/pull/1075) | landed in wave A ([#1254](https://github.com/lambdaclass/stabileo/pull/1254)) |
| 3 | **Build WASM once and retry only infrastructure errors,** with a stall timeout (a hung `cargo fetch` is killed and retried) | Each WASM rebuild costs minutes per job; infra reds were rerun by hand | [#866](https://github.com/lambdaclass/stabileo/pull/866) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 4 | **Path-filtered PR checks:** a PR runs what its change touches; the merge queue still runs everything | Docs and web-only PRs waited on the whole engine suite | [#863](https://github.com/lambdaclass/stabileo/pull/863) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 5 | **Every job on self-hosted runners,** pools by label, superseded merge-group runs cancelled, timeouts on every job | Hosted runners moved to Ubuntu 26.04 and broke Playwright on every PR; stale merge-group runs took runner slots ahead of live ones | [#1221](https://github.com/lambdaclass/stabileo/pull/1221) | landed in the CI wave ([#1252](https://github.com/lambdaclass/stabileo/pull/1252)) |
| 6 | **Lighter merge-queue checks,** with the full suite on main after merge, a rerun on failure, then an automatic signed revert PR and an urgent alert | The queue should only block on what catches most breakage; the rest still runs on every main commit and reverts fast | [#1226](https://github.com/lambdaclass/stabileo/pull/1226) | landed in the CI wave; **waits on the user:** repo secrets `REVERT_BOT_TOKEN` and `NTFY_TOPIC`; each revert PR needs a human approval |
| 7 | **Move the first six runners into the runner pools,** plus the pending host system upgrade | The first six runners still run outside the pool slice and its limits | — | **waits on the user**, once the queue is empty (restarts each runner) |
| 8 | **Runner labels and watchdog token:** `stabileo-pr` on the first runners; drop the borrowed `stabileo` label from the later ones once #1221 lands; a fine-grained PAT for the watchdog | The pools only isolate jobs if the labels match them; the watchdog cannot restart a runner without a token | after #1221 | **waits on the user** |
| 9 | **Wall-clock budgets on the timing pool** (`stabileo-timing`), for main and nightly only | Timing checks on shared runners flake under load and block the queue | [#1241](https://github.com/lambdaclass/stabileo/pull/1241) | landed (2026-11-03); the timing pool for main and nightly is still to do |
| 10 | **Proof checks required:** Lean, symbolic and Kani as required checks in both rulesets (branch protection and merge queue) | #1235 runs them in the merge queue; until they are required, a red one does not block | [#1235](https://github.com/lambdaclass/stabileo/pull/1235) | #1235 landed in the CI wave; **waits on the user** |
| 11 | **Mutants rotation:** 32 shards a night, so every shard runs every 16 days instead of every 128, with a staleness check | The weekly staleness check fails until 16 nights of markers exist; expected, not a regression | [#1240](https://github.com/lambdaclass/stabileo/pull/1240) | landed in the CI wave |
| 12 | **Perf ratchet margin:** keep the strict 64-byte margin or widen it | Strict means nearly every PR that changes shipped web code also runs `make perf.budget.accept`, and two such PRs conflict on `web/perf-budget.json` | [#768](https://github.com/lambdaclass/stabileo/pull/768) | **waits on the user** |
| 13 | **Agent hygiene:** a unique scratchpad log name per agent | Two agents overwrote each other's engine logs on 2026-11-02 | (agent instructions; issue to file) | open |
| 14 | **Cancel superseded merge-group runs** automatically | A rebuilt queue left the old run for the same PR holding a runner | [#1242](https://github.com/lambdaclass/stabileo/pull/1242) | landed in wave A |
| 15 | **Cap concurrent E2E per host,** or lower the queue's maximum entries to build | At 14 headless Chrome jobs the CI host saturates and @slow E2E fails with "Target page closed"; each failed batch costs about 2 h | the ruleset | the ruleset builds at most 5 entries since 2026-11-03; **waits on the user:** `stabileo-e2e` labels and `STABILEO_E2E_POOL=true` |
| 16 | **Steps agents cannot run:** `gh pr ready` on drafts (today #1229) and `gh run cancel` on stale merge-group runs are refused by the permission classifier | Ready PRs wait as drafts and stale runs hold runner slots until a person acts | (process; issue to file) | **waits on the user:** run them, or allow them |
| 17 | **Second reviewer and reviewer sandbox:** a second reviewer, and a sandbox that keeps an automated reviewer away from local services | Two reviews before main; a prompt-injected reviewer could reach local services | [#842](https://github.com/lambdaclass/stabileo/pull/842) | **waits on the user** |
| 18 | **AI reviews from six models on every PR** | Outside contribution (klaus993); posts a review comment per model and needs six API secrets | [#1245](https://github.com/lambdaclass/stabileo/pull/1245) | landed in wave A |
| 19 | **Shorter builds:** research WASM bundles built in parallel and saved bundle by bundle, with a retried restore; the Docker image built from source on a PR only when its recipe changes; PRs off magic-nix-cache, so they stop churning the Actions cache | The research WASM and the Docker source build were the long poles of a PR run | [#1335](https://github.com/lambdaclass/stabileo/pull/1335), [#1373](https://github.com/lambdaclass/stabileo/pull/1373), [#1346](https://github.com/lambdaclass/stabileo/pull/1346), [#1374](https://github.com/lambdaclass/stabileo/pull/1374) | landed 2026-11-04 |
| 20 | **Runner isolation:** scheduled runs never take the merge queue's runners; Code_Aster's micromamba installs into the job's temp directory | Nightly jobs held the queue's runners while a queued fix waited; a micromamba binary left on a self-hosted runner failed the next Code_Aster comparison | [#1348](https://github.com/lambdaclass/stabileo/pull/1348), [#1376](https://github.com/lambdaclass/stabileo/pull/1376) | landed 2026-11-04 |
| 21 | **Next:** automatic retry of infrastructure reds (cache 429, nix substituter, HTTP/2 framing); docs-only PRs scoped to the docs checks; the merge queue's critical path (E2E waits and research WASM) | Infra reds are still rerun by hand; a docs PR still waits on web jobs | (to open) | planned |

**Exit criteria.** A docs PR gets its checks in under 10 minutes; the merge queue has no hung runner
for a week; every infra red is retried automatically, and a broken main is reverted within an hour.
