# Dedaliano Solver Roadmap

## Purpose

This document is the `solver roadmap`.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- current proof and capability status: [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
- verification method: [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
- shell-family selection notes: [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md)
- competitor shell-family comparison: [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md)
- numerical-methods gap analysis: [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md)
- RC design/BBS research: [`research/rc_design_and_bbs.md`](/Users/unbalancedparen/projects/dedaliano/research/rc_design_and_bbs.md)

It is for:
- solver mechanics
- numerical robustness
- validation and benchmark sequencing
- verification strategy sequencing
- performance and scale work

It is not the product, market, or revenue roadmap.
For that, see [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).

For current capability and validation status, see [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).
For shell-family selection and competitor comparison research, use the research notes linked above.

This document should stay forward-looking.
Historical progress belongs in [`CHANGELOG.md`](/Users/unbalancedparen/projects/dedaliano/CHANGELOG.md).

## Current Frontier

The sparse shell solve viability blocker is resolved and runtime gains are now measured. Dense LU fallback has been eliminated on representative shell models. Sparse Cholesky delivers 22-89× factorization speedup over dense LU (22× end-to-end at 30×30 MITC4), with 0 perturbations across all tested sizes and families. Fill ratio grows from 2.6× to 7.0× with mesh size, and AMD now beats RCM on fill for larger shell meshes. Assembly and DOF numbering are deterministic. Residual-based parity testing is in place.

Measured runtime data (Criterion, factorization only):

| Family | Mesh | nf | Dense LU | Sparse Chol | Speedup |
|--------|------|----|----------|-------------|---------|
| MITC4 | 6×6 | ~210 | 1.19ms | 0.88ms | 1.4× |
| MITC4 | 10×10 | 684 | 18.8ms | 4.17ms | 4.5× |
| MITC4 | 15×15 | ~1400 | 184ms | 16.4ms | 11× |
| MITC4 | 20×20 | 2564 | 986ms | 43.8ms | 22× |
| MITC4 | 30×30 | 5644 | 12.2s | 157ms | 77× |
| Quad9 | 5×5 | ~700 | 18.9ms | 4.2ms | 4.5× |
| Quad9 | 10×10 | ~2600 | 974ms | 56ms | 17× |
| Quad9 | 15×15 | ~5700 | 12.5s | 141ms | 89× |
| Curved | 8×8 | ~450 | 5.9ms | 10.1ms | 0.58× |
| Curved | 16×16 | ~1700 | 277ms | 109ms | 2.6× |
| Curved | 24×24 | ~3600 | 3.0s | 406ms | 7.4× |

Key observations:
- sparse wins on all families above ~500 DOFs
- dense still wins at curved 8×8 (~450 DOFs) — sparse overhead dominates at small sizes
- fill ratio grows with mesh size (not constant); AMD is now the measured fill winner on larger shell meshes
- 0 perturbations everywhere — Cholesky is clean
- at 30×30 MITC4 (5644 DOFs), sparse assembly + solve takes 0.56s vs 12.3s dense — 22× end-to-end

The main remaining work is:

- deeper sparse eigensolver integration after the now-partly-done sparse reuse into modal/buckling/harmonic/reduction, with modal and buckling already on sparse eigensolver paths in the common unconstrained case
- runtime and memory measurement on the newly sparse modal/buckling/harmonic/reduction workflows
- verification hardening around the new sparse path (determinism, parity gates, fill-ratio gates)
- RC-unblocking design-grade result extraction — beam station extraction is done with sign-convention metadata, grouped-by-member convenience layer with member-level governing summaries, and optional governing entries; remaining: 3D integration test depth, design-ready metadata for cover assumptions once RC design integration begins
- long-tail nonlinear hardening (mixed nonlinear cases)
- product surfacing (deterministic diagnostics and solve timings in the app)
- shell-family workflow maturity and selection guidance
- shell-adjacent workflow breadth (layered shells, axisymmetric workflows, nonlinear shell depth)
- solver-path consistency
- deeper reference-benchmark coverage on the newest advanced paths

## What Still Separates Dedaliano From The Strongest Open Solvers

Based on the comparison against projects like OpenSees, Code_Aster, and Kratos, the remaining gaps are not “missing the basics.” They are:

1. `Performance / scale maturity`
   Sparse Cholesky runtime gains are measured: 22-89× factorization speedup, 22× end-to-end, 0 perturbations. Sparse-path reuse is now partly done across modal/buckling/harmonic/reduction, and modal plus buckling already have sparse eigensolver paths in the common unconstrained case. The next steps are runtime measurement on the newly sparse workflows, deeper sparse eigensolver integration, and eigensolver cleanup.

2. `Long-tail nonlinear maturity`
   More years of hardened edge cases are still needed in mixed nonlinear workflows:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence cases

3. `Full solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.

4. `Benchmark moat expansion`
   Dedaliano is already strong here, but broader external-reference proof is also the most realistic path to becoming the best open structural solver.

5. `Shell-family workflow maturity`
   `MITC4 + MITC9 + SHB8-ANS + curved shells` now form a real production shell stack. The remaining shell work is no longer basic shell breadth, but shell-family guidance, workflow hardening, and the next important shell-adjacent capabilities competitors still expose clearly.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver product with the deepest visible proof of correctness`

## What Would Make Dedaliano 10x Better

The next big gains are no longer about collecting more categories. They are about making the solver:

- faster on large real models
- more obviously correct
- more deterministic
- harder to break on ugly mixed workflows
- easier to select and use correctly across the shell stack

In practice, that means the main multipliers are:

1. `Runtime and scale dominance`
   Sparse paths should not only work; they should decisively win on the workflows that matter.

2. `Verification moat`
   Every important solver path should be protected by reference benchmarks, acceptance models, runtime/fill gates, parity checks, and stronger invariant/property/fuzz coverage.

3. `Long-tail nonlinear robustness`
   The solver should stay reliable on shell + nonlinear, contact + staging, and difficult convergence paths.

4. `Solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows should keep converging to the same behavior.

5. `Shell workflow maturity`
   The advantage is now the multi-family shell stack used correctly, not raw shell-family count.

## Ranked Priorities

If the goal is `best open structural solver`, the current priority order is:

1. `Phase A: WASM path reliability and single-solver convergence`
   This is now the highest priority ahead of further solver-method depth.
   The immediate goal is to make Rust/WASM the trustworthy main execution path in the product, fix the frontend/WASM boundary completely, and remove the need for the TypeScript solver as a runtime backup. That means:
   - prove deploy/build consistency between JS glue and `.wasm`
   - verify production is serving the expected branch and commit
   - harden main-thread solve, worker solve, and multi-case/combo solve paths
   - eliminate branch-specific or deploy-specific WASM traps
   - add enough diagnostics to localize failures at the JS/WASM boundary
   - make production failures reproducible from a captured solver-run artifact, not just screenshots
   - define explicit deletion criteria for the TypeScript solver runtime path
   - retire the JS solver only after the WASM path is stable end-to-end

2. `Runtime and scale dominance`
   Sparse shell viability, deterministic assembly, sparse modal/buckling/harmonic depth, and reduction factorization reuse are now real. The next step is to turn those improvements into a clearly dominant runtime story across the remaining measured bottlenecks.

3. `Verification moat expansion`
   The next decisive advantage is stronger proof:
   - reference benchmarks
   - acceptance models
   - runtime/fill gates
   - determinism and parity gates
   - invariant, property-based, and fuzz coverage

4. `Verification hardening around the new sparse path`
   The sparse path is now live and deterministic. Lock it in with:
   - determinism gates (sorted assembly, merged DOF numbering)
   - residual-based parity gates (sparse vs dense solutions verified via residual norm)
   - fill-ratio gates (< 200× on representative shell meshes)
   - no-dense-fallback gates on representative shell models
   - sparse modal, buckling, and harmonic parity plus no-`k_full`-overbuild expectations
   - sparse reduction gates:
     - Guyan single-factorization behavior
     - Craig-Bampton interior eigensolve success
     - reduction parity where available
   - release-mode sparse smoke tests for numerically sensitive workflows
   - `parallel`-feature smoke tests so the parallel sparse path stays aligned with serial behavior
   - doctest coverage in CI so example/documentation regressions are caught early
   - broader invariant, property-based, and fuzzing coverage around sparse/shell paths
   - signal-driven benchmark growth: add tests that improve proof, regression protection, performance confidence, or edge-case coverage

5. `Design-grade result extraction for downstream RC workflows`
   Beam station extraction is now implemented with full API safety: `extract_beam_stations` / `extract_beam_stations_3d` (flat), `extract_beam_stations_grouped` / `extract_beam_stations_grouped_3d` (grouped-by-member with member-level governing summaries). Features: configurable stations per member, per-combo forces via diagram evaluation, governing pos/neg tracking with combo provenance (Optional — no phantom infinities), combo_name propagation, sign-convention metadata embedded in output, section/material metadata, WASM-exported, snapshot-tested. Remaining work:
   - 3D integration test coverage (currently 2D-only in integration tests)
   - design-ready metadata for cover assumptions once RC design integration begins

6. `Long-tail nonlinear hardening`
   Now that the linear/shell sparse base is healthier, mixed nonlinear cases become more worth attacking:
   - contact + nonlinear + staging
   - shell + nonlinear interaction
   - difficult convergence edge cases

7. `Solver-path consistency`
   Keep dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows converging to the same behavior.

8. `Product surfacing`
   Deterministic diagnostics and solve timings are now much more valuable in the app:
   - expose pivot perturbation counts and fill ratios in the UI
   - surface solve phase breakdowns for user visibility
   - make solver-path selection and fallback behavior transparent

9. `Result trust and auditability`
   A top-tier structural solver must make results easier to trust and audit:
   - reaction equilibrium summaries
   - residual / conditioning summaries
   - governing-result provenance
   - explainable solver-path and warning outputs suitable for reports and QA

10. `Constraint-system maturity`
   Finish chained constraints, connector depth, eccentric workflow polish, and remaining parity gaps.

11. `Advanced contact maturity`
   Push harder convergence, richer contact laws, and tougher mixed contact states.

12. `Reference benchmark expansion`
    Keep growing external-reference proof for contact, fiber 3D, SSI, creep/shrinkage, and broader shell workflows.
    Prefer:
    - reference cases that close real proof gaps
    - acceptance models that protect multi-feature workflows
    - regression tests for real bugs
    - performance gates that protect runtime, fill, and no-fallback expectations
    Avoid low-signal count inflation.

13. `Shell-family workflow maturity`
    Keep the shell-family selection guidance current, maintain the frontier-gate benchmarks, and only reopen shell-family expansion if the current stack proves insufficient on practical workflows.

14. `Shell-family automatic selection policy`
    Turn shell-family guidance into explicit rules the UI and model layer can use for automatic defaults, explainable recommendations, and safe override behavior.

15. `Shell-adjacent workflow breadth competitors still expose clearly`
    Add the highest-value missing shell-related workflow classes:
    - layered / laminated shell workflows
    - axisymmetric workflows
    - deeper nonlinear / corotational shell depth

16. `Native / server execution maturity`
    If Rust is the one solver, browser WASM is not enough. Native/server execution should become first-class for heavy runs, enterprise workflows, and reproducible batch analysis.

17. `Reduction, staged/PT coupling, and other second-tier depth`
    Mature the scale-oriented and long-term workflow layers after the core solver-quality gaps above are tighter.

## Current Sequence

The current near-term sequence is:

1. `Phase A: fix the WASM/frontend connection`
   Before more solver backlog depth, make the Rust/WASM path fully reliable in production:
   - one trusted deploy path
   - one trusted WASM artifact set
   - reliable 3D solve in main thread and workers
   - reliable combinations / multi-case execution
   - diagnostics strong enough to root-cause any remaining trap instead of masking it
   - production failure capture strong enough to turn a user report into a deterministic repro
   - remove the TypeScript solver from runtime use once this is stable

2. `Runtime and scale`
   Keep eliminating the remaining measured bottlenecks in harmonic, reduction, and sparse eigensolver/reduction internals.

3. `Design-grade RC extraction`
   Beam station extraction, grouped-by-member convenience layer, sign-convention metadata, and governing summaries are done. Remaining:
   - 3D integration test depth
   - design-ready metadata for cover assumptions and bar schedules once RC design integration begins

4. `Verification moat`
   Keep turning major solver gains into release-gated, benchmarked, acceptance-covered proof.

5. `Long-tail nonlinear hardening`
   Focus on ugly mixed cases where mature solvers still win.

6. `Solver-path consistency`
   Keep dense vs sparse and mixed-family workflows aligned.

7. `Product surfacing`
   Expose timings, diagnostics, fill, fallback behavior, and shell-family guidance clearly.

8. `Shell-family workflow guidance and frontier tracking`
   Keep the multi-family shell stack well-guided and benchmarked.

9. `Shell-family automatic selection policy`
   Turn guidance into real default-selection logic.

10. `Shell-adjacent workflow breadth`
   Add layered shells, axisymmetric workflows, and deeper nonlinear shell depth.

## Phases And Finish Criteria

### Phase A: WASM Path Reliability And Single-Solver Convergence

Goal:
- Rust/WASM becomes the trusted primary solver path in production
- the frontend/WASM boundary is stable enough that the TypeScript solver is no longer needed at runtime

Finish means:
- production is confirmed to serve the intended branch and commit
- JS glue and `.wasm` artifacts are always built and deployed together in the same pipeline
- representative 2D and 3D example solves succeed through the WASM path in production
- worker-based and main-thread solve paths both succeed on representative 3D models
- combinations / multi-case execution succeeds through the WASM path on representative models
- the production app no longer shows raw WASM trap messages such as `unreachable`
- production failures can be captured into a reproducible solver-run artifact with build SHA and solver-path metadata
- runtime fallback to the TypeScript solver is removed from the shipped app
- no shipped UI path imports the TypeScript runtime solver for actual solving

Concrete proof:
- one named CI/deploy check that verifies the built commit SHA is the one served by the app
- one representative 2D solve and one representative 3D solve exercised through the browser-facing WASM entry points
- one representative worker/combo solve exercised through the production code path
- one reproducible failure-capture path that records build SHA, solver path, ordering, key diagnostics, and enough input/output state to replay the issue locally
- zero known production-only WASM trap regressions open
- explicit deletion checklist for the TS solver runtime path is complete

### Phase B: Runtime And Scale Dominance

Goal:
- sparse/direct and eigensolver paths decisively win on the large-model workflows that matter

Finish means:
- buckling runtime is measured on the sparse eigensolver path
- Guyan and Craig-Bampton runtime is measured after factorization reuse
- remaining harmonic bottlenecks are measured after modal-response acceleration
- reduction internals no longer densify the important `K_ff` paths unnecessarily
- CI tracks representative runtime/fill behavior on the main sparse workflows
- workflow-level timing and memory are tracked, not only kernel-level factorization timing

Concrete proof:
- runtime tables exist for modal, buckling, harmonic, Guyan, and Craig-Bampton on representative models
- sparse path wins are recorded on the target model sizes, not just factorization microbenchmarks
- no-`k_full`-overbuild expectations are enforced where applicable
- fill-ratio, no-dense-fallback, and residual-parity gates stay green in CI
- solve-to-results timing exists for representative browser/product workflows
- representative browser memory ceilings and worker startup overhead are measured

### Phase C: Verification Moat Expansion

Goal:
- major solver paths are protected by visible, release-grade proof

Finish means:
- acceptance models cover the hardest production-style linear, shell, constrained, and mixed workflows
- sparse vs dense parity is covered on representative models
- determinism gates exist where assembly / numbering / ordering should be deterministic
- invariant, property-based, and fuzz coverage exists around the sparse/shell/contact/constraint frontier
- benchmark growth stays signal-driven instead of count-driven
- public solver/output contracts are stable enough to version and protect in CI

Concrete proof:
- explicit CI gates exist for sparse shells, sparse modal/buckling/harmonic, and reduction workflows
- representative reference models exist for contact, fiber 3D, SSI, creep/shrinkage, and shell workflows
- parity and residual thresholds are written down and enforced
- doctests and release-mode smoke tests are part of CI, not local-only habits
- contract/snapshot CI exists for public solver payloads that product code depends on

### Phase D: Design-Grade Extraction For RC Workflows

Goal:
- solver outputs are complete and stable enough for RC design, schedules, and later BBS work

Finish means:
- beam station extraction is stable in 2D and 3D through the WASM surface
- grouped-by-member convenience outputs are stable enough for product use
- governing metadata, sign conventions, and provenance are explicit and documented
- integration coverage exists for the 3D extraction path
- remaining metadata needed by RC design is explicit once cover/bar-detail assumptions begin
- result contracts are versioned or otherwise evolution-safe for downstream consumers

Concrete proof:
- contract/snapshot tests protect the serialized payload shape
- 2D and 3D integration tests exercise full solve-to-extraction paths
- governing outputs never emit phantom combos or sentinel infinities
- product code can consume station data without reconstructing solver semantics from raw arrays
- payload/schema evolution rules are documented and enforced by tests

### Phase E: Long-Tail Nonlinear Hardening And Solver-Path Consistency

Goal:
- ugly mixed workflows stop being the place where mature solvers obviously outperform Dedaliano

Finish means:
- mixed shell + nonlinear regressions exist and stay green
- contact + nonlinear + staging regressions exist and stay green
- difficult convergence cases have predictable behavior and clearer failure modes
- dense vs sparse, constrained vs unconstrained, and mixed frame/shell workflows stay aligned

Concrete proof:
- named regressions exist for the hard mixed workflows above
- parity expectations are encoded for representative dense vs sparse and constrained vs unconstrained cases
- solver-path-specific result divergences are treated as regressions, not expected quirks
- known nonlinear edge cases have acceptance coverage instead of only anecdotal reproduction

### Phase F: Result Trust, Auditability, And Model Quality Gates

Goal:
- the solver becomes easier to trust before and after a run, not only numerically stronger internally

Finish means:
- bad models are caught earlier with clear pre-solve diagnostics
- result outputs expose enough equilibrium / residual / provenance information for QA and reporting
- user-visible warnings are tied to actual solver evidence rather than generic failure text

Concrete proof:
- pre-solve checks exist for disconnected subgraphs, instability risk, poor constraints, duplicate/near-duplicate nodes, shell distortion / Jacobian risk, and suspicious local-axis setups
- result payloads expose equilibrium/residual/conditioning summaries on representative workflows
- solver-run artifacts can be attached to bug reports and reviewed by engineering without manual reconstruction

### Phase G: Shell Workflow Maturity And Breadth

Goal:
- the multi-family shell stack is not only broad, but guided, benchmarked, and hard to misuse

Finish means:
- shell-family guidance is explicit enough for automatic defaults and explainable override behavior
- frontier-gate shell benchmarks stay current across the active families
- the highest-value remaining shell-adjacent workflow gaps are closed:
  - layered / laminated shells
  - axisymmetric workflows
  - deeper nonlinear / corotational shell depth

Concrete proof:
- shell-family selection rules are written and exercised in the product/model layer
- frontier benchmarks exist for the active shell families on the workflows they are meant to cover
- layered, axisymmetric, and deeper nonlinear shell workflows each have at least one reference/acceptance case
- shell-family expansion is not reopened unless the current stack fails on practical workflows

### Phase H: Native / Server Execution Maturity

Goal:
- Rust runs as one solver across browser and native/server contexts, not just as a browser WASM artifact

Finish means:
- representative heavy workflows can run natively/server-side using the same solver codebase
- native/browser parity is checked on representative cases
- server/batch execution is reproducible enough for long analyses, reports, and enterprise workflows

Concrete proof:
- at least one named native/server execution path exists and is tested
- representative browser vs native parity cases are green
- heavy-model or long-running workflow(s) have a documented native/server execution recommendation

## Full Backlog

1. Measure buckling runtime on the sparse eigensolver path
2. Measure Guyan runtime after factorization reuse
3. Measure Craig-Bampton runtime after factorization reuse and interior-mode fix
4. Optimize the harmonic frequency sweep path further if modal-response still leaves big wins on the table
5. ~~Add deterministic beam station-force extraction for RC design~~ — DONE
6. ~~Add governing-combination extraction for beam design checks and schedules~~ — DONE (grouped-by-member layer with member-level governing summaries)
7. ~~Add design-grade result metadata and provenance for downstream RC workflows~~ — DONE (sign-convention metadata, combo_name propagation, Optional governing entries)
8. ~~Add regression/parity fixtures for RC-ready beam envelopes and sign conventions~~ — DONE (snapshot test, integration tests, 21 total tests)
9. Deepen sparse eigensolver integration in reduction workflows
10. Fix the Lanczos tridiagonal eigensolver properly everywhere it still falls back
11. Add broader sparse shift-invert support
12. Add runtime gates for modal, buckling, harmonic, Guyan, and Craig-Bampton
13. Add no-`k_full`-overbuild gates everywhere they apply
14. Add stronger fill-ratio and determinism gates on the sparse path
15. Expand sparse/dense residual-parity coverage on harder shell and mixed models
16. Harden mixed shell + nonlinear workflows
17. Harden contact + nonlinear + staging workflows
18. ~~Add `Modified Newton`~~ — DONE (corotational 2D/3D + fiber 2D/3D; caches Cholesky from iter 0; not a universal default, useful where factorization cost dominates and material nonlinearity is moderate; full NR remains more robust in geometric nonlinearity and deep plasticity)
19. Add iterative refinement before any remaining expensive fallback path
20. Add `PCG` with `Jacobi` preconditioning
21. Add stronger preconditioners like `IC(0)` / `SSOR` if justified by measurements
22. Implement shell-family automatic selection in the solver/model layer
23. Add layered / laminated shell workflows
24. Add axisymmetric workflows
25. Deepen nonlinear / corotational shell workflows
26. Add quasi-Newton methods such as `BFGS`, `L-BFGS`, and `Broyden`
27. Add `GMRES` / `MINRES` for indefinite systems
28. Add block eigensolvers such as `LOBPCG` / block Lanczos
29. Deepen layered/composite shell constitutive behavior
30. Add richer prestress tendon / relaxation workflows
31. Add bridge-specific staged / moving-load workflow depth
32. Add fatigue workflows
33. Add fire / temperature-dependent nonlinear workflows
34. Add more specialized shell / continuum families only if still justified
35. Add production solver-run artifact capture with build SHA, solver path, ordering, and diagnostics
36. Add deterministic repro-bundle export for production failures
37. Add versioned / contract-tested public solver payloads
38. Add workflow-level timing and browser memory baselines, not only kernel microbenchmarks
39. Add explicit TypeScript-solver deletion checklist and migration gates
40. Add native / server execution parity and batch-run coverage
41. Add pre-solve model quality gates for instability risk, duplicate nodes, bad constraints, and shell distortion risk
42. Add result audit summaries: equilibrium, residual, conditioning, and governing provenance

## Active Programs

### 1. Shell-Family Maturity

Focus:
- release-gated shell benchmarks (`MITC4`, `MITC9`, `SHB8-ANS`, and curved-shell frontiers)
- shell load vectors
- mixed tri/quad and beam-shell workflows
- shell modal and buckling consistency
- distortion tolerance
- shell stress recovery consistency
- shell-family comparative benchmark tables and selection guidance
- shell-family automatic-selection rules for default product behavior

Current status:
- MITC4+EAS-7, MITC9, SHB8-ANS, and curved shells are all implemented, benchmarked, and part of the production shell stack
- shell-family frontier gates now exist across MITC4, MITC9, SHB8-ANS, and curved-shell benchmarks
- the shell question is no longer “do we have enough shell breadth?” but “how do we harden and guide the multi-family stack?”

Current remaining shell backlog:
- shell-family selection guidance and explicit “use / avoid” rules for MITC4, MITC9, SHB8-ANS, and curved shells
- a rule-based shell-family selector for automatic defaults and explainable recommendations
- broader curved/non-planar workflow validation with the multi-family shell stack
- broader shell modal, buckling, and dynamic reference cases across the multi-family shell stack
- better shell diagnostics and output semantics in solver results
- MITC9 corotational extension (deferred)
- layered / laminated shell workflows
- axisymmetric workflows for shells of revolution
- nonlinear / corotational shell workflow depth across the multi-family stack

Decision support:
- use [`research/shell_family_selection.md`](/Users/unbalancedparen/projects/dedaliano/research/shell_family_selection.md) for current family-choice rules and default-selection logic
- use [`research/competitor_element_families.md`](/Users/unbalancedparen/projects/dedaliano/research/competitor_element_families.md) to justify why layered shells, axisymmetric workflows, and deeper nonlinear shell depth are the highest-value shell-adjacent additions

Known formulation boundary:
- MITC4+EAS-7: efficient for flat and mildly curved shells
- MITC9: higher-order shell path with better accuracy on standard shell benchmarks at lower mesh density
- SHB8-ANS: strong solid-shell option on the curved/non-planar frontier
- curved shell: preferred family for severe shell-of-revolution and genuinely curved geometry where flat-faceted families are weakest
- shell breadth is no longer the open gap; the remaining shell work is hardening, guidance, and performance across the multi-family stack

Recommended shell order:
1. keep the shell-family selection guidance and frontier gates current
2. add the most important shell-adjacent workflow breadth competitors still expose:
   - layered / laminated shell workflows
   - axisymmetric workflows
   - nonlinear / corotational shell depth
3. turn shell-family guidance into an explicit automatic selection policy for the product layer
4. only reopen shell-family expansion if the current MITC4 / MITC9 / SHB8-ANS / curved-shell stack proves insufficient on practical workflows

Why it matters:
Shell quality is one of the clearest separators between a strong structural solver and a top-tier one.

### 2. Constraint-System Reuse and Deepening

Focus:
- consistent reuse of constrained reductions across solver families
- chained constraints
- eccentric workflow polish
- connector depth
- cross-solver parity in forces and outputs

Why it matters:
Real structural models rely heavily on diaphragms, rigid links, MPCs, and eccentric connectivity. Inconsistent constrained behavior destroys trust.

### 3. Performance and Scale

Focus:
- full-model runtime and memory benchmarks
- broader sparse-path reuse across solver families
- parallel assembly scaling on heavier element families
- conditioning diagnostics
- eigensolver debt cleanup
- CI protection for sparse/eigensolver/reduction wins

Current status:
- **sparse shell solve viability is done**: direct left-looking symbolic Cholesky with two-tier pivot perturbation eliminates dense LU fallback on all shell families (MITC4, MITC9, curved shell)
- **ordering policy is now measured**: early RCM work fixed catastrophic fill on representative shell meshes, and AMD is now the preferred default direction on the larger shell meshes that matter most
- **dense fallback eliminated**: wall-time share dropped from 87% to 0% on a 50×50 MITC4 plate (~15k DOFs)
- **assembly is deterministic**: all HashMap element iterations sorted by ID across dense, sparse, and parallel paths
- **DOF numbering is deterministic**: multiple supports targeting the same node merge constraint flags with OR
- **residual-based parity testing**: sparse and dense solutions both verified via ||Ku-f||/||f|| < 1e-6
- **benchmark gates in place**: no-dense-fallback gate, fill-ratio gate (< 200×), sparse-vs-dense residual parity gate
- sparse-first 3D assembly is live for plates, quads, and frames (models with 64+ free DOFs)
- parallel element assembly via rayon (`parallel` feature flag) is wired into the 3D sparse solver path
- all 8 element families parallelized through a unified `AnyElement3D` work pool
- memory benchmarks show 11-22× reduction on representative 10×10 to 15×15 shell models
- criterion benchmarks cover flat-plate (up to 50×50 = 2500 quads) and mixed frame+slab models (up to 8-storey, 8×8 slab)
- the Lanczos tridiagonal eigensolver debt is now resolved with implicit symmetric QR
- sparse assembly reuse is now in place for 3D modal, buckling, harmonic, Guyan, and Craig-Bampton workflows, eliminating dense `n×n` assembly there
- `from_triplets` / duplicate-compaction overhead is fixed, and `k_ff`-only sparse assembly exists where full reactions are not needed
- modal, buckling, and harmonic 3D now have sparse eigensolver paths in the common unconstrained case
- Guyan and Craig-Bampton reuse one factorization instead of repeating hundreds of LU decompositions
- the next scale bottlenecks are now workflow-specific:
  - buckling runtime measurement on the new sparse path
  - remaining reduction internals that still densify
  - harmonic sweep cost after the modal-response acceleration

Measured parallel assembly results (Apple Silicon, release build):

| Model | Elements | DOFs | Serial | Parallel | Speedup |
|-------|----------|------|--------|----------|---------|
| 20×20 flat plate | 400 quads | ~2.6k | 82 ms | 80 ms | 1.03× |
| 30×30 flat plate | 900 quads | ~5.8k | 411 ms | 386 ms | 1.06× |
| 50×50 flat plate | 2500 quads | ~15.6k | 2.96 s | 2.91 s | 1.02× |
| 8-storey mixed | 512 quads + 32 frames | ~3.3k | 161 ms | 157 ms | 1.03× |

MITC4 element stiffness is lightweight (~200 ops), so the parallel overhead nearly cancels the speedup. Quad9 and curved-shell elements (5-10× heavier per element) will show stronger scaling.

Updated numerical-methods order:

1. ~~sparse shell solve viability~~ — DONE
2. ~~fill-reducing ordering quality~~ — DONE (ordering quality is measured, and AMD is now the preferred default direction on larger shell meshes)
3. ~~measure real full-model runtime gains~~ — DONE
4. deepen sparse eigensolver integration in reduction workflows
5. measure buckling runtime and any remaining harmonic/reduction bottlenecks
6. sparse shift-invert eigensolver path
7. iterative refinement and Krylov solvers
8. ~~modified Newton~~ — DONE (implemented for corotational and fiber nonlinear solvers; not a universal default)
9. quasi-Newton variants

See [`research/numerical_methods_gap_analysis.md`](/Users/unbalancedparen/projects/dedaliano/research/numerical_methods_gap_analysis.md).

Next steps:
- measure buckling runtime on the sparse eigensolver path
- measure the remaining harmonic / Guyan / Craig-Bampton bottlenecks after the recent speedups
- push sparse deeper into reduction internals instead of converting `K_ff` back to dense where avoidable
- add CI gates for the new sparse/eigensolver/reduction guarantees
- move to iterative refinement / Krylov only after the current direct sparse path is mature enough

Why it matters:
A solver is not elite if it only works well on small clean examples.

#### CI / Gate Discipline

The newest sparse/eigensolver/reduction wins should be explicit CI gates, not only part of the full suite.

Add or keep explicit named gates for:
- sparse shell gates:
  - no dense fallback
  - fill ratio bounds
  - deterministic sparse assembly
  - sparse vs dense residual parity
- sparse modal / buckling / harmonic parity gates
- sparse reduction gates:
  - Guyan single-factorization behavior
  - Craig-Bampton interior eigensolve success
  - reduction parity where available
- release-mode sparse smoke coverage
- `parallel`-feature smoke coverage
- doctest coverage

What still needs more testing:
- buckling runtime/fill gates on the new sparse path
- harmonic/reduction workflow runtime gates after the latest optimizations
- no-`k_full`-overbuild expectations in every workflow that should build only `k_ff`
- broader mixed shell + nonlinear acceptance models
- broader contact + nonlinear + staging acceptance models
- more invariant/property/fuzz coverage around sparse eigensolver and reduction paths

### 4. Verification Hardening

Focus:
- benchmark gates
- acceptance models
- invariants
- property-based tests
- fuzzing
- differential consistency tests
- signal-driven benchmark growth only

Rule:
- do not add low-signal tests just to increase the count
- add tests that improve:
  - proof
  - regression protection
  - performance confidence
  - edge-case coverage

Why it matters:
This is how the solver becomes visibly trustworthy rather than merely feature-rich.

### 5. Observability, Reproducibility, And Auditability

Focus:
- solver-run artifacts
- build SHA and solver-path metadata
- reproducible bug capture
- equilibrium / residual / conditioning summaries
- versioned result contracts

Why it matters:
A solver becomes dramatically more valuable when failures are reproducible and results are auditable instead of opaque.

### 6. Long-Tail Nonlinear Hardening

Focus:
- mixed contact + nonlinear + staged cases
- shell/nonlinear interaction hardening
- difficult convergence edge cases
- stronger fallback and failure behavior on ill-conditioned real models

Why it matters:
This is the main remaining place where mature open solvers still have more years of hardened behavior than Dedaliano.

### 7. Native / Server Execution

Focus:
- native parity with browser WASM
- heavy-model execution outside the browser
- batch / report / enterprise execution paths

Why it matters:
If Rust is the one solver, it should not be constrained to browser-only execution for the workloads where native execution is clearly better.

## Exit Criteria

### Shell-family maturity

Already done:
- MITC4+EAS-7, MITC9, and SHB8-ANS are all accepted as part of the production shell stack
- curved/non-planar benchmarks written and running (twisted beam, Raasch hook, hemisphere R/t sweep) — results document the flat-faceted limit

Remaining to close:
- the shell-family selection guidance and frontier boundaries are explicitly documented
- shell-family selection policy is explicit enough for automatic defaults plus manual override
- distortion and warp studies are gated and bounded
- the highest-value shell-adjacent workflow gaps are closed:
  - layered / laminated shell workflows
  - axisymmetric workflows
  - nonlinear / corotational shell depth

### Performance and scale

Already done:
- sparse shell solve viability (dense fallback eliminated, fill ratio 1.8×)
- deterministic assembly and DOF numbering
- residual-based parity testing and benchmark gates

Remaining to close:
- sparse assembly overhead is no longer a dominant cost on medium shell models
- sparse path is extended deeper than `assemble_sparse_3d() + to_dense_symmetric()` in modal, buckling, harmonic, and reduction workflows
- large-model memory/runtime baselines are tracked in CI
- eigensolver debt is resolved

### Verification hardening

Done means:
- benchmark gates exist for the newest advanced solver families
- acceptance models cover the hardest production-style workflows
- invariants, property tests, and fuzzing exist for sparse/shell/contact/constraint paths
- benchmark discipline is part of release quality, not just local testing

### Long-tail nonlinear hardening

Done means:
- hard mixed nonlinear regressions exist and stay green
- convergence behavior is predictable on difficult reference cases
- failure modes are clearer and less solver-path-specific

### Solver-path consistency

Done means:
- dense vs sparse parity is explicitly covered on representative models
- constrained vs unconstrained parity is stable
- mixed frame/shell workflows do not diverge by solver path
- result outputs remain consistent across linear and advanced solver families

### WASM path reliability and single-solver convergence

Done means:
- deployed production builds are traceable to a specific commit and solver artifact set
- main-thread, worker, and combo/multi-case WASM paths are green on representative examples
- production failures can be replayed locally from a captured artifact
- the TypeScript runtime solver path is removed

### Result trust, auditability, and contracts

Done means:
- public solver payloads used by product code are contract-tested and evolution-safe
- representative results expose equilibrium/residual/conditioning/provenance summaries
- pre-solve model quality gates catch the most common invalid-model causes before solve

### Native / server execution

Done means:
- at least one real native/server execution path is maintained and tested
- representative browser/native parity checks are green
- heavy workflows have a documented execution recommendation and proof path

## Must-Have Vs Later

### Must-have to become the best open structural solver

- shell endgame maturity
- performance and scale
- WASM path reliability and single-solver convergence
- verification hardening
- observability / reproducibility / auditability
- long-tail nonlinear hardening
- solver-path consistency
- constraint-system maturity

### Important after the core claim is secure

- advanced contact maturity
- broader reference benchmark expansion
- model reduction / substructuring workflow maturity
- deeper prestress / staged time-dependent coupling
- specialized shell breadth
- deterministic-behavior and explainability refinement
- broader native/server workflow packaging after core parity is secure

### Later specialization

- fire / fatigue / specialized lifecycle domains
- membranes / cable nets / specialized tensile structures
- bridge-specific advanced workflows
- broader domain expansion

## Non-Goals Right Now

- no broad multiphysics expansion
- no new specialty domains before shell, scale, verification, and nonlinear hardening are tighter
- no solver-scope expansion driven by product/UI convenience
- no feature-count work ahead of validation, robustness, and scale
- no roadmap drift into a changelog or benchmark ledger

## Related Docs

- [`README.md`](/Users/unbalancedparen/projects/dedaliano/README.md)
  repo entry point and document map
- [`BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)
  capability and benchmark evidence
- [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)
  verification philosophy and testing stack
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
  app, workflow, market, and product sequencing
