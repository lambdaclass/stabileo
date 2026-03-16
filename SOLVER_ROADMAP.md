# Dedaliano Solver Roadmap

## Purpose

This is the solver roadmap for mechanics, numerical robustness, validation sequencing, verification strategy, and performance/scale work. It is not the product, market, or revenue roadmap — for that, see `PRODUCT_ROADMAP.md`. For current capability and validation status, see `BENCHMARKS.md`. Historical progress belongs in `CHANGELOG.md`.

For the cross-cutting AI track that depends on these solver outputs and contracts, see `research/ai_structural_engineering_roadmap.md`.
For the deeper solver safety and validation hardening architecture behind the near-term trust work, see `research/solver_safety_and_validation_hardening.md`.

## Where We Are

Sparse direct solver, deterministic assembly, multi-family shell stack (MITC4+EAS-7, MITC9, SHB8-ANS, curved shell), sparse eigensolver paths for modal/buckling/harmonic, beam station extraction for RC design, grouped/member-level 3D extraction, design-demand bridging for RC/steel checks, Modified Newton-Raphson, the WASM production path, TypeScript solver retirement, AMD default ordering, sparse 2D/3D buckling, sparse 3D reduction block extraction, and the first sparse buckling runtime gate are all done. See `BENCHMARKS.md` for the full snapshot and measured benchmark data.

The live near-term blockers are now:
- final design-grade extraction contract hardening for downstream RC/steel workflows
- constraint-system maturity and sparse/runtime hardening on real workflows
- structured diagnostics, query-ready results, and automation-ready contracts

## ASAP Hardening Work

Before broadening the solver into more design-code and advanced-analysis depth, the following fixes should land as soon as possible because they affect trust in the current validation and delivery path:

1. `Eliminate false-green tests` — missing fixtures in differential/property parity tests must fail loudly or be reported as intentionally ignored, not pass silently without assertions.
2. `Finish the last extraction hardening gaps` — the 3D solve→stations→demands bridge is in place, but payload evolution rules and downstream contract discipline still need to be locked down.
3. `Strengthen test oracles` — improve equilibrium checks to cover distributed loads and moment balance, and tighten tolerance policy so regression tests are not looser than the value of the signal they protect.
4. `Move wall-clock timing checks out of normal pass/fail tests` — timing-sensitive sparse-vs-dense assertions should live in benchmarks, explicit gates, or ignored perf suites rather than flaky default test runs.
5. `Close current sparse reduction/runtime gaps` — remove avoidable densification in reduction workflows, add buckling runtime/fill gates on the new sparse paths, and enforce no-`k_full`-overbuild expectations where applicable.
6. `Keep solver trust visible` — every hardening change above should add proof, not only code: CI gates, contract tests, analytical/reference checks, or reproducible artifacts.

See also: `research/solver_safety_and_validation_hardening.md` for the fuller defense-layer architecture around validation, convergence safeguards, post-solve verification, diagnostics, and frontend mutation guards.

## What Still Separates Dedaliano From The Strongest Open Solvers

The remaining gaps are not "missing the basics." They are:

1. `Performance / scale maturity` — sparse Cholesky runtime gains are measured (22-89x factorization, 22x end-to-end, 0 perturbations). Sparse-path reuse is partly done across modal/buckling/harmonic/reduction. Next: deeper sparse eigensolver integration and runtime measurement on the newly sparse workflows.
2. `Long-tail nonlinear maturity` — more years of hardened edge cases are still needed in mixed nonlinear workflows (contact + nonlinear + staging, shell + nonlinear interaction, difficult convergence).
3. `Full solver-path consistency` — dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.
4. `Benchmark moat expansion` — broader external-reference proof is the most realistic path to becoming the best open structural solver.
5. `Shell-family workflow maturity` — MITC4 + MITC9 + SHB8-ANS + curved shells form a real production shell stack. Basic selection guidance already exists; the remaining work is automatic defaulting, workflow hardening, and shell-adjacent capabilities, not missing core shell breadth.

This changes the strategic target: not `be broader than every open-source mechanics framework` but `be the strongest open structural solver product with the deepest visible proof of correctness`.

## What Would Make Dedaliano 10x Better

The next big gains are not about collecting more categories. They are about making the solver faster on large real models, more obviously correct, more deterministic, harder to break on ugly mixed workflows, and easier to select and use correctly across the shell stack.

1. `Runtime and scale dominance` — sparse paths should not only work; they should decisively win on the workflows that matter.
2. `Verification moat` — every important solver path should be protected by reference benchmarks, acceptance models, runtime/fill gates, parity checks, and stronger invariant/property/fuzz coverage.
3. `Long-tail nonlinear robustness` — the solver should stay reliable on shell + nonlinear, contact + staging, and difficult convergence paths.
4. `Solver-path consistency` — dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows should keep converging to the same behavior.
5. `Shell workflow maturity` — the advantage is now the multi-family shell stack used correctly, not raw shell-family count.
6. `Automation-ready outputs` — the solver should not stop at forces; it should expose the structured, governing, code-ready data product automation needs immediately.

## What The Solver Must Enable Beyond The Core App

If the product roadmap succeeds, the solver becomes the foundation for more software than the main app itself. The solver roadmap should only carry the enabling work, not the downstream product definitions.

1. `Stable runtime and API/WASM contracts` — product layers like RC design, reports, QA, and configurators need long-lived contracts, not shifting payload shapes.
2. `Design-grade extraction` — downstream software depends on trustworthy stations, envelopes, governing cases, provenance, and deterministic metadata. Currently implemented: `extract_beam_stations` / `extract_beam_stations_3d` (flat), `extract_beam_stations_grouped` / `extract_beam_stations_grouped_3d` (grouped-by-member with member-level governing summaries). Features: configurable stations per member, per-combo forces via diagram evaluation, governing pos/neg tracking with combo provenance (Optional — no phantom infinities), combo_name propagation, sign-convention metadata, section/material metadata, WASM-exported, snapshot-tested.
3. `Report-grade provenance and diagnostics` — report OS and QA layers need solver-path, warnings, timings, residuals, and governing-result provenance in a form suitable for users and documents.
4. `Machine-readable warnings and review signals` — earlier AI-assisted UX and lightweight collaboration need diagnostics that are not just human-readable, but structured enough for comments, review flows, and assistant suggestions.
5. `Headless and native execution` — firm workflows, cloud comparison, batch runs, and heavier report jobs need native/server execution in addition to browser WASM.
6. `Reproducibility` — QA/review and collaboration products need deterministic replay, build IDs, and captured solver-run artifacts.
7. `Model quality gates` — review and peer-check layers work much better when the solver catches instability, disconnected subgraphs, shell pathologies, and bad support conditions before solve.
8. `Web/desktop runtime parity` — if the product ships as both browser and Tauri desktop, the solver contracts, diagnostics, and major workflows need parity across WASM-in-browser and native/local execution surfaces.
9. `Design-automation-ready result contracts` — code-check UIs, AI suggestions, and section optimization need normalized governing-case outputs, utilization inputs, stable member identifiers, and machine-readable result summaries rather than only raw forces.
10. `Query-ready result indexing` — natural-language result queries and review tooling need fast access to maxima, minima, governing combinations, element groups, and named scopes without forcing the UI to recompute everything ad hoc.
11. `Batch and optimization execution` — global section optimization, Pareto runs, and generative layout workflows need repeatable headless execution, deterministic result payloads, and infrastructure for multi-run sweeps.

## The Automation Gap The Solver Must Close

> Full analysis: [research/automation_gaps.md](research/automation_gaps.md)

The most important remaining solver-adjacent gap is not "one more analysis method." It is enabling the product to automate the decisions engineers still make manually after the solve.

The solver already computes forces, reactions, modes, and envelopes. To support real design automation, it must also provide:

1. `Code-ready load metadata` — enough structure to auto-generate and track code combinations, accidental torsion, pattern loading, and load provenance
2. `Design-grade member demand extraction` — governing N/V/M/T with stable metadata, not just raw element force arrays
3. `Utilization-input contracts` — clean inputs for steel/RC/timber/masonry code checks without ad hoc UI-side reconstruction
4. `Report-grade provenance` — governing case, location, check context, and solver diagnostics suitable for documents
5. `Optimization-ready batch interfaces` — repeatable solve APIs for section suggestion, global optimization, and generative comparison

Without this layer, the product can analyze structures but still cannot automate the 60-70% of engineering work that happens after analysis.

## Shell Formulation Boundaries

- **MITC4+EAS-7**: efficient for flat and mildly curved shells
- **MITC9**: higher-order shell path with better accuracy on standard shell benchmarks at lower mesh density
- **SHB8-ANS**: strong solid-shell option on the curved/non-planar frontier
- **Curved shell**: preferred family for severe shell-of-revolution and genuinely curved geometry where flat-faceted families are weakest
- Shell breadth is no longer the open gap; the remaining shell work is hardening, guidance, and performance across the multi-family stack

Decision support:
- Use `research/shell_family_selection.md` for current family-choice rules and default-selection logic
- Use `research/competitor_element_families.md` to justify why layered shells, axisymmetric workflows, and deeper nonlinear shell depth are the highest-value shell-adjacent additions

Recommended shell order:
1. Keep the shell-family selection guidance and frontier gates current
2. Add the most important shell-adjacent workflow breadth: layered/laminated, axisymmetric, nonlinear/corotational depth
3. Turn shell-family guidance into an explicit automatic selection policy for the product layer
4. Only reopen shell-family expansion if the current stack proves insufficient on practical workflows

## Numerical Methods Priority Order

1. ~~Sparse shell solve viability~~ — DONE
2. ~~Fill-reducing ordering quality~~ — DONE (AMD is preferred default on larger shell meshes)
3. ~~Measure real full-model runtime gains~~ — DONE
4. Deepen sparse eigensolver integration in reduction workflows
5. Measure buckling runtime and remaining harmonic/reduction bottlenecks
6. Sparse shift-invert eigensolver path
7. Iterative refinement and Krylov solvers
8. ~~Modified Newton~~ — DONE (corotational + fiber; not universal default)
9. Quasi-Newton variants (BFGS, L-BFGS, Broyden)
10. Iterative solvers (PCG + IC(0), GMRES/MINRES) — Step 15
11. AMG preconditioner for million-DOF models — Step 15
12. Multi-frontal solver + nested dissection (METIS) — Step 15
13. Total/Updated Lagrangian for continuum large-strain — Step 15
14. Domain decomposition (FETI) — Step 15
15. Supernodal Cholesky — Step 15
16. WebGPU compute shaders — Step 15

See `research/numerical_methods_gap_analysis.md`.

## Immediate Solver Priority For Automation

If automation is pulled earlier in the product roadmap, the solver should respond in this order:

1. `WASM/runtime trust` — the automation layer is useless if the main solve path is not trustworthy
2. `Design-grade extraction and governing metadata` — the product needs stable member demands, governing combinations, and provenance
3. `Structured diagnostics and query-ready result summaries` — automation, AI assistance, and review should consume structured payloads, not scrape raw tables
4. `Code/load metadata contracts` — automatic combinations, the first narrow code-load generation slice, and design checks need solver-side metadata that survives into reports and exports
5. `Batch/headless execution ergonomics` — optimization and generative workflows come only after the first automation surfaces are stable

## Daily, Weekly, Monthly Priority Lens

The solver should be prioritized by how often the downstream engineering work actually happens.

### Daily work enablers

These are the solver capabilities that support everyday billable engineering and therefore should stay first:

- WASM/runtime trust and single-solver convergence
- design-grade extraction and governing metadata
- structured diagnostics, provenance, and model quality gates
- query-ready result contracts for reports, review, and AI assistance
- code/load metadata contracts for combinations, first code-load generation, and design checks
- section- and member-level outputs that support RC and steel design workflows

Roadmap home:
- Solver Steps 1-3
- Solver Step 14 in support of product automation
- the design-oriented subset of later extraction/post-processing work

### Weekly work enablers

These are important recurring workflows, but they should not outrank the daily delivery layer:

- runtime/scale improvements that make larger real jobs practical
- verification moat expansion and stronger parity/fuzz/property coverage
- shell workflow maturity and automatic family guidance
- headless/native parity for desktop, reports, and office workflows
- broader automatic load generation once the contracts are solid

Roadmap home:
- Solver Steps 4-7
- Solver Step 12
- Solver Step 14

### Monthly / specialist enablers

These are critical for advanced users and long-term moat, but they are not the first things most engineers bill every week:

- dynamic analysis, nonlinear materials, and pushover
- advanced elements, contact depth, and specialized post-processing
- optimization, probabilistic methods, and digital-twin loops
- incremental/collaborative solver paths and AI/surrogate support

Roadmap home:
- Solver Step 8 and beyond

## Must-Have Vs Later

### Must-have to become the best open structural solver

**Core solver trust (Steps 1-7):**
- Shell endgame maturity (all families hardened, guided, and auto-selected)
- Performance and scale (sparse direct dominance, measured runtime wins)
- WASM path reliability and single-solver convergence
- Verification hardening (gates, acceptance models, CI)
- Observability / reproducibility / auditability
- Long-tail nonlinear hardening
- Solver-path consistency (dense/sparse, constrained/unconstrained)
- Constraint-system maturity

**Dynamic and nonlinear (Steps 8-10):**
- Dynamic analysis (Newmark-β, HHT-α, explicit, Rayleigh/modal/Caughey damping) — Step 8
- Nonlinear material models (concrete, steel, geotechnical, return mapping framework) — Step 9
- Pushover analysis (capacity spectrum, N2, MPA, plastic hinge elements) — Step 10

**Critical element gaps:**
- Force-based beam-column element (what makes OpenSees dominant) — Step 11
- Timoshenko beam with warping DOF (open sections are wrong without this) — Step 11
- Full shell triangle (MITC3/DSG3 — meshing freedom is non-negotiable) — Step 11
- Plastic hinge beam element (makes pushover practical at building scale) — Step 10

**Critical post-processing gaps:**
- Wood-Armer moments (shell-based RC slab design is impossible without this) — Step 19
- Section cuts / nodal force summation for shell/solid design — Step 19
- Result envelopes for shells across load combinations — Step 19

### Important after the core claim is secure

- Advanced element library (isolators, BRB, catenary, panel zones, infill walls) — Step 11
- 6-node triangular shell (MITC6) and axisymmetric shell of revolution — Step 11
- Composite laminate failure criteria (Tsai-Wu, Hashin) — Step 11
- Automatic load generation (wind, seismic ELF, snow, patterns) — Step 14
- Iterative solvers (PCG, AMG) and multi-frontal solver for 100k+ DOFs — Step 15
- Total/Updated Lagrangian for continuum large-strain analysis — Step 15
- Contact depth (augmented Lagrangian, mortar, friction, self-contact) — Step 18
- Constraint depth (shell-to-solid coupling, embedded elements, tie constraints) — Step 18
- Stress linearization for pressure vessel codes (ASME, EN 13445) — Step 19
- Submodeling / global-local analysis — Step 19
- Advanced reference benchmark expansion
- Model reduction / substructuring workflow maturity
- Deeper prestress / staged time-dependent coupling
- Broader native/server workflow packaging

### Later specialization

- Thermal stress and fire analysis — Step 13
- Fatigue analysis (rainflow counting, S-N curves, weld assessment) — Step 13
- Progressive collapse (GSA/UFC alternate path) — Step 13
- Topology optimization and sensitivity analysis — Step 16
- Reliability and probabilistic analysis (FORM/SORM, Monte Carlo) — Step 17
- Bayesian model updating and digital twin calibration (MCMC, sensor data, damage detection) — Step 17
- Uncertainty quantification (PCE, stochastic FEM, Sobol sensitivity) — Step 17
- Domain decomposition (FETI) for distributed parallelism — Step 15
- WebGPU compute shaders — Step 15
- 3D solid elements (C3D8, C3D20, C3D4, C3D10) — Step 11
- Continuum shell elements (SC6R, SC8R) — Step 11
- Geotechnical materials (Cam-Clay) — Step 9
- User-defined material interface (UMAT) — Step 9
- Error estimation and adaptive h-refinement — Step 19
- Cohesive zone models for delamination/fracture — Step 18
- Periodic BCs for homogenization — Step 18
- Membranes / cable nets / specialized tensile structures
- Bridge-specific advanced workflows
- Broader domain expansion

## The Sequence

### Step 1 — WASM Path Reliability and Single-Solver Convergence

Status: core transition complete.

Rust/WASM is now the trusted main execution path in production and the TypeScript solver runtime path is retired. The remaining work from this transition is no longer a standalone phase; it lives in ongoing trust, verification, and diagnostics hardening below.

**Completed:**
- Rust/WASM is the production solve path
- The TypeScript solver runtime path is deleted from shipped solve flows
- Main-thread, worker, and combo solve paths run through the browser-facing WASM boundary
- JS/WASM deploy-path issues and production import-path issues have been closed
- Differential-fuzz retirement work has been converted away from the old TS runtime dependency
- Browser-facing solve flows are stable enough that the roadmap can move on to design-grade extraction, diagnostics, and daily engineering workflows

**Remaining spillover now tracked elsewhere:**
- production solver-run artifact capture and replayability → Step 3
- browser/cross-browser trust hardening → Steps 3 and 5
- any future JS/WASM boundary regressions → Step 3 diagnostics and Step 5 verification moat

### Step 2 — Design-Grade RC Extraction Hardening

The core extraction bridge is now in place: 2D/3D beam stations, grouped-by-member summaries, 3D solve→extraction tests, stable JSON field-name checks, and the first solve→stations→demands→steel-check pipeline all exist. The remaining work is to harden contracts and downstream evolution rules so product automation can safely build on top of them.

**What:**
- Add design-ready metadata for cover assumptions and bar schedules once RC design integration begins
- Keep contract/snapshot tests protecting the serialized payload shape as the payload evolves
- Add versioned or evolution-safe result contracts for downstream consumers
- Ensure governing outputs never emit phantom combos or sentinel infinities
- Extend the same design-grade contract discipline to non-RC member demand extraction so steel/code-check workflows do not rebuild semantics from raw forces
- Add more representative solve-to-extraction regression fixtures for RC and steel workflows so product code does not drift back toward ad hoc UI reconstruction

**Done when:**
- 2D and 3D integration tests continue to exercise full solve-to-extraction paths
- Contract/snapshot tests protect the serialized station payload shape
- Product code can consume station data without reconstructing solver semantics from raw arrays
- Payload/schema evolution rules are documented and enforced by tests

### Step 3 — Result Trust and Structured Diagnostics

Make the solver easier to trust before and after a run, and make diagnostics structured enough for AI-assisted review, collaboration, and automated guidance. A solver becomes dramatically more valuable when failures are reproducible and results are auditable instead of opaque.

**What:**
- **Pre-solve model quality gates:** disconnected subgraph detection, instability risk, poor/conflicting constraints, duplicate/near-duplicate nodes, shell distortion / Jacobian risk, suspicious local-axis setups
- **Machine-readable warning codes** — stable enum-based codes that AI and review UIs can match on without brittle string parsing
- **Stable severity levels** — error / warning / info with consistent semantics across all solver paths
- **Element/member/node references in every diagnostic** — annotation-ready references for comments, review flows, and AI suggestions
- **Provenance metadata** — every diagnostic carries the solver path, phase, and combination that produced it
- **Deterministic solver-run artifacts** — build SHA, solver path, ordering, key diagnostics, and enough input/output state to replay any issue locally
- **Post-solve trust signals:** equilibrium / residual / conditioning summaries in result payloads, governing-result provenance (which combination, which station, which check)
- Expose pivot perturbation counts, fill ratios, and solve phase breakdowns in the UI
- Make solver-path selection and fallback behavior transparent
- Add query-ready summaries for maxima/minima/governing cases so product-level result Q&A and AI explanation do not scrape tables or raw arrays
- Strengthen equilibrium and trust oracles in the validation helpers so distributed loads, moment balance, and constrained-force behavior are checked consistently instead of only by weak ad hoc helpers
- Tighten tolerance policy by test type: analytical/reference tests should be much stricter than benchmark-comparison tolerances, and regression tests should not inherit permissive benchmark tolerances by default

**Done when:**
- Pre-solve checks exist for all model quality gates listed above
- Diagnostic payloads have a stable schema with code, severity, element_ids, and provenance fields
- Result payloads expose equilibrium/residual/conditioning summaries on representative workflows
- Solver-run artifacts can be attached to bug reports and replayed locally
- At least one AI/review consumer uses structured codes, not string parsing
- Result-query consumers can answer governing-case questions from structured payloads instead of ad hoc UI recomputation

### Step 4 — Runtime and Scale Dominance

Turn the sparse infrastructure into a clearly dominant runtime story across all measured bottlenecks. A solver is not elite if it only works well on small clean examples.

Current status: AMD is already the default fill-reducing ordering, so the old "Phase 4a" ordering change is done. All 8 element families are parallelized through a unified `AnyElement3D` work pool. Memory benchmarks show 11-22x reduction on representative 10x10 to 15x15 shell models. Criterion benchmarks cover flat-plate (up to 50x50 = 2500 quads) and mixed frame+slab models (up to 8-storey, 8x8 slab). Sparse 3D Guyan/Craig-Bampton no-constraint paths now extract `K_bb/K_bi/K_ib/K_ii` directly from sparse `K_ff`, Guyan reaction recovery extracts `K_rf` directly from sparse `k_full`, and a 10x10 plate sparse buckling runtime gate is in place. The next live work here is constraint-system maturity plus broader runtime/fill measurement on real workflows.

**What:**
- Measure Guyan and Craig-Bampton runtime after factorization reuse
- Measure remaining harmonic bottlenecks after modal-response acceleration
- Deepen sparse eigensolver integration in reduction workflows — reduction internals should not densify `K_ff` unnecessarily
- Add broader sparse shift-invert support
- Add runtime gates for modal, buckling, harmonic, Guyan, and Craig-Bampton
- Add no-`k_full`-overbuild gates everywhere they apply
- Add stronger fill-ratio and determinism gates on the sparse path
- Track workflow-level timing and memory, not only kernel-level factorization timing
- Measure representative browser memory ceilings and worker startup overhead
- Add iterative refinement before any remaining expensive fallback path
- **Performance regression CI:** runtime benchmarks must be re-checked on every merge, not measured once and forgotten. Add CI gates that fail if key benchmarks regress beyond a tolerance (e.g. sparse factorization time, end-to-end solve time on representative models). Track trends, not just pass/fail.
- Add headless batch-run ergonomics for optimization and comparison workflows so runtime wins are usable outside the interactive UI
- Move wall-clock-sensitive sparse-vs-dense timing assertions out of normal default tests and into benchmark/explicit-perf gate paths so correctness CI is not flaky

**CI / Gate Discipline:**
- Sparse shell gates: no dense fallback, fill ratio bounds, deterministic sparse assembly, sparse vs dense residual parity
- Sparse modal / buckling / harmonic parity gates
- Sparse reduction gates: Guyan single-factorization behavior, Craig-Bampton interior eigensolve success, reduction parity where available
- Release-mode sparse smoke coverage
- `parallel`-feature smoke coverage
- Doctest coverage
- What still needs more testing: broader buckling runtime/fill coverage beyond the first sparse gate, harmonic/reduction workflow runtime gates, no-`k_full`-overbuild expectations in every workflow that should build only `k_ff`, broader mixed shell + nonlinear acceptance models, broader contact + nonlinear + staging acceptance models, more invariant/property/fuzz coverage around sparse eigensolver and reduction paths

**Done when:**
- Runtime tables exist for modal, buckling, harmonic, Guyan, and Craig-Bampton on representative models
- Sparse path wins are recorded on target model sizes, not just factorization microbenchmarks
- No-`k_full`-overbuild expectations are enforced where applicable
- Fill-ratio, no-dense-fallback, and residual-parity gates stay green in CI
- Solve-to-results timing exists for representative browser/product workflows
- Sparse assembly overhead is no longer a dominant cost on medium shell models
- Performance regression CI gates exist and fail on regressions beyond defined tolerance

### Step 5 — Verification Moat

Protect major solver paths with visible, release-grade proof. This is how the solver becomes visibly trustworthy rather than merely feature-rich.

**What:**
- Add acceptance models covering the hardest production-style linear, shell, constrained, and mixed workflows
- Expand sparse vs dense parity coverage on representative and harder shell/mixed models
- Add determinism gates where assembly / numbering / ordering should be deterministic
- Add invariant, property-based, and fuzz coverage around sparse/shell/contact/constraint frontier
- Add representative reference models for contact, fiber 3D, SSI, creep/shrinkage, and shell workflows
- Add release-mode sparse smoke tests for numerically sensitive workflows
- Add `parallel`-feature smoke tests so the parallel sparse path stays aligned with serial behavior
- Add doctest coverage in CI
- Add contract/snapshot CI for public solver payloads that product code depends on
- Keep benchmark growth signal-driven (proof, regression protection, performance confidence, edge-case coverage) — not count-driven
- Rule: do not add low-signal tests just to increase the count. Add tests that improve proof, regression protection, performance confidence, or edge-case coverage
- **Property-based invariant tests:** equilibrium preservation (sum of reactions = applied loads), stiffness matrix symmetry, stiffness matrix positive-definiteness (for well-constrained models), energy bounds (strain energy ≥ 0, work-energy theorem), rigid body mode detection (6 zero eigenvalues for free 3D structure), partition-of-unity on shape functions, patch test satisfaction per element family
- **Fuzz testing depth:** `cargo-fuzz` or `proptest` on solver entry points with randomized geometry, loads, materials, and boundary conditions. Target: crash-free on 10,000+ random models, not just the curated benchmark set. Fuzz the WASM serialization boundary (malformed JSON, truncated payloads, NaN/Inf inputs)
- **Real-model regression suite:** collect saved models from real users (with permission) or generate realistic messy models (mixed element types, irregular topology, nearly-coplanar shells, short members, eccentric connections). These catch failures that textbook benchmarks miss.
- **WASM vs native parity tests:** run the same solver inputs through both native `cargo test` and the WASM build, compare results to machine precision. Catches f64 rounding differences, memory layout issues, and WASM-specific codegen bugs.
- Make missing-fixture behavior explicit in parity/fuzz suites: missing required fixtures should fail or be reported as ignored/skipped infrastructure, never silently count as passing verification
- **Mutation testing:** use `cargo-mutants` or equivalent to measure whether the test suite actually catches regressions. A test suite with 5908 passing tests is worthless if mutating the solver code doesn't fail any of them.
- **Design-automation regression tests:** verify that code-check inputs, governing-case extraction, and report-grade metadata remain stable on representative building workflows, not only that raw solve numbers match

**Done when:**
- Explicit CI gates exist for sparse shells, sparse modal/buckling/harmonic, and reduction workflows
- Representative reference models exist for contact, fiber 3D, SSI, creep/shrinkage, and shell workflows
- Parity and residual thresholds are written down and enforced
- Doctests and release-mode smoke tests are part of CI
- Public solver contracts are stable enough to version and protect in CI
- Property-based invariant tests cover equilibrium, symmetry, energy bounds, and rigid body modes
- Fuzz testing runs crash-free on 10,000+ random models
- At least 10 real-model or realistic-messy-model regressions are in the suite
- WASM vs native parity tests pass on representative workflows
- Mutation testing score is tracked and improving
- Design-automation regressions protect the downstream contracts product features depend on

### Step 6 — Long-Tail Nonlinear Hardening and Solver-Path Consistency

Stop ugly mixed workflows from being the place where mature solvers obviously outperform Dedaliano. This is the main remaining place where mature open solvers still have more years of hardened behavior than Dedaliano.

**What:**
- Harden mixed shell + nonlinear workflows with named regressions
- Harden contact + nonlinear + staging workflows with named regressions
- Improve difficult convergence edge cases with predictable behavior and clearer failure modes
- Keep dense vs sparse, constrained vs unconstrained, and mixed frame/shell workflows aligned
- Add quasi-Newton methods (BFGS, L-BFGS, Broyden)
- Add PCG with Jacobi preconditioning; add IC(0) / SSOR if justified by measurements
- Add GMRES / MINRES for indefinite systems
- Finish constraint-system maturity: consistent reuse of constrained reductions across solver families, chained constraints, connector depth, eccentric workflow polish, cross-solver parity in forces and outputs. Real structural models rely heavily on diaphragms, rigid links, MPCs, and eccentric connectivity — inconsistent constrained behavior destroys trust.

**Done when:**
- Named regressions exist for hard mixed workflows and stay green
- Parity expectations are encoded for representative dense vs sparse and constrained vs unconstrained cases
- Solver-path-specific result divergences are treated as regressions, not expected quirks
- Known nonlinear edge cases have acceptance coverage instead of only anecdotal reproduction

### Step 7 — Shell Workflow Maturity and Breadth

Make the multi-family shell stack not only broad, but guided, benchmarked, and hard to misuse. Shell quality is one of the clearest separators between a strong structural solver and a top-tier one.

Already done: curved/non-planar benchmarks written and running (twisted beam, Raasch hook, hemisphere R/t sweep) — results document the flat-faceted limit.

**What:**
- Finalize shell-family selection guidance with explicit "use / avoid" rules for MITC4, MITC9, SHB8-ANS, and curved shells
- Implement rule-based shell-family automatic selection policy for default product behavior and explainable recommendations
- Maintain frontier-gate shell benchmarks across all active families
- Add layered / laminated shell workflows with composite constitutive behavior
- Add axisymmetric workflows for shells of revolution
- Deepen nonlinear / corotational shell workflows across the multi-family stack
- Add broader curved/non-planar workflow validation
- Add broader shell modal, buckling, and dynamic reference cases
- Improve shell diagnostics and output semantics
- MITC9 corotational extension (deferred unless needed)

**Done when:**
- Shell-family selection rules are written and exercised in the product/model layer
- Frontier benchmarks exist for active shell families on the workflows they cover
- Layered, axisymmetric, and deeper nonlinear shell workflows each have at least one reference/acceptance case
- Shell-family expansion is not reopened unless the current stack fails on practical workflows

### Step 8 — Dynamic Analysis

Full dynamic time-history capability, matching OpenSees on the common 80% of earthquake engineering work. Dynamic and pushover analysis is what OpenSees is famous for — this is the capability that makes Dedaliano the go-to tool for earthquake engineering.

**What:**
- **Time integration:** Newmark-beta implicit (beta=1/4, gamma=1/2), HHT-alpha with numerical dissipation (alpha in [-1/3, 0]), explicit central difference with critical dt and matrix-free element force evaluation
- **Mass matrices:** consistent mass matrix alongside existing lumped, lumped mass with rotational inertia for torsional mode accuracy
- **Damping models:** Rayleigh (alpha*M + beta*K), modal (per-mode damping ratios), Caughey (generalized Rayleigh for >2 frequencies), frequency-dependent for viscoelastic components, non-proportional with complex eigenvalue analysis, material-specific hysteretic damping
- **Nonlinear dynamics:** Newton-Raphson within each time step with material + geometric nonlinearity, operator-splitting for efficiency
- **Controls and output:** energy balance monitoring, adaptive time stepping, checkpoint/restart for long analyses, ground motion input as base excitation, response history extraction at selected nodes/DOFs
- **Random vibration / PSD analysis:** power spectral density input for wind/wave/traffic, response PSD and RMS extraction
- **Response spectrum enhancements:** CQC3 (three-component earthquake), SRSS, CQC, GMC, Gupta methods, missing mass correction for truncated modes

**Done when:**
- Linear Newmark-beta and HHT-alpha pass known analytical solutions (SDOF free vibration, step load, harmonic forcing)
- Nonlinear dynamic passes OpenSees-comparable benchmarks (RC column pushover, steel frame cyclic)
- Energy balance stays within tolerance across all dynamic benchmarks
- Adaptive stepping reduces total cost on variable-difficulty problems
- Complex eigenvalue analysis with non-proportional damping matches known solutions
- PSD-driven random vibration matches Nastran/SAP2000 on standard benchmark cases

### Step 9 — Nonlinear Materials

Realistic material behavior for concrete, steel, and general path-dependent materials, enabling practical RC and steel nonlinear analysis. The return mapping framework makes adding new materials systematic. Without geotechnical materials, foundation and soil analysis is impossible. Without UMAT, every new material requires modifying the solver source.

**What:**
- **Computational plasticity framework:** general return mapping algorithm (yield surface, flow rule, hardening law, closest-point projection, consistent tangent operator), J2 (von Mises) plasticity with isotropic/kinematic/mixed hardening, isotropic hardening (Voce, linear, power-law, tabular), kinematic hardening (Armstrong-Frederick, Chaboche multi-backstress), Gauss-point substepping for material integration robustness
- **Material state framework:** commit/revert/copy for path-dependent materials, fiber section with multiple materials (concrete core + cover + rebar), 3D fiber section (biaxial bending: epsilon_0, kappa_y, kappa_z), moment-curvature analysis from section integration, M-N-V interaction surface generation, UMAT-equivalent user-defined material interface
- **Concrete models:** Kent-Park / modified Kent-Park (confined/unconfined), Mander confined concrete, Concrete02 with tension stiffening, concrete damage plasticity (CDP), fib Model Code 2010, Eurocode 2 parabola-rectangle, smeared/rotating crack with tension cutoff and shear retention, damage mechanics (Mazars, Lemaitre)
- **Steel models:** bilinear (elastic-perfectly-plastic and strain-hardening), Menegotto-Pinto (Steel02) with Bauschinger effect, Giuffre-Menegotto-Pinto combined hardening, Steel4 (asymmetric, ultimate stress, fracture strain)
- **Geotechnical materials:** Drucker-Prager, Mohr-Coulomb, Modified Cam-Clay
- **General constitutive:** orthotropic/anisotropic elasticity (timber, masonry, composites), hyperelastic (Neo-Hookean, Mooney-Rivlin) for rubber bearings and seismic isolators, creep & shrinkage (ACI 209, fib MC 2010, CEB-FIP), viscoelastic (Kelvin-Voigt, Maxwell), fatigue (Coffin-Manson, rainflow counting, Palmgren-Miner)

**Done when:**
- Each uniaxial material passes cyclic stress-strain verification against published curves
- Fiber sections with mixed concrete+steel reproduce known moment-curvature responses
- Mander model matches confinement-dependent peak stress and strain within 2% of analytical formulas
- Hysteretic energy dissipation matches reference solutions under cyclic loading
- Return mapping converges on all standard plasticity benchmarks (thick cylinder, notched bar, Cook's membrane)
- Drucker-Prager/Mohr-Coulomb reproduce bearing capacity and slope stability results within 5%
- UMAT interface allows external material definition without recompiling the solver

### Step 10 — Pushover Analysis

Static pushover for seismic assessment, with capacity spectrum and performance point identification.

**What:**
- **Pushover methods:** displacement-controlled with arc-length control, load patterns (inverted triangular, uniform, modal-proportional per EC8/ASCE 7), plastic hinge tracking with ductility demand per step, capacity curve extraction with bilinear idealization, capacity spectrum method (ATC-40 / FEMA 440), N2 method (Eurocode 8), multi-modal pushover (MPA)
- **Concentrated plasticity elements:** plastic hinge beam element for building-scale pushover, multi-linear moment-rotation hinges (user-defined or code-based backbone curves), FEMA 356/ASCE 41 hinge tables for concrete beams/columns, steel beams/columns, and steel braces, fiber hinge with automatic backbone curve generation

**Done when:**
- Pushover on known benchmark frames matches published capacity curves
- Performance point identification agrees with hand calculations on standard SDOF/MDOF cases
- Plastic hinge sequence matches expected failure mode for standard frame configurations
- Concentrated plasticity hinge matches distributed plasticity within expected accuracy

### Step 11 — Advanced Element Library

Element families for specialized structural analysis beyond frames and shells — closing every element gap against Abaqus, OpenSees, and Code_Aster. The force-based beam is the single most important missing element. Shell triangles are non-negotiable for practical meshing. Warping DOF is needed for every steel structure with open sections.

**What:**
- **Advanced beam elements:** force-based beam-column element (OpenSees gold standard for nonlinear frames), Timoshenko beam with warping DOF (7-DOF for open thin-walled sections), Vlasov theory (bimoment, warping, shear center offset), tapered elements, curved beams, rigid end zones / offsets, mixed formulation beams (Hellinger-Reissner)
- **Shell elements for meshing freedom:** full shell triangle (MITC3/DSG3 with membrane+bending+drilling), 6-node triangular shell (MITC6/STRI65), axisymmetric shell of revolution element, continuum shell elements (SC6R, SC8R), thick shell formulation (full Reissner-Mindlin for R/t < 5), composite laminate failure criteria (Tsai-Wu, Tsai-Hill, Hashin, Puck)
- **Special structural elements:** seismic isolators (bilinear, friction pendulum), viscous dampers (F = C*v^alpha), BRB (backbone + hysteresis), panel zone (Krawinkler model), infill wall (Crisafulli diagonal strut), gap/hook elements, cohesive zone elements (traction-separation for delamination/debonding/fracture)
- **Cable & tension structures:** full catenary element (exact stiffness), form-finding (force density, dynamic relaxation), membrane elements for fabric structures
- **3D solid elements:** C3D8 with B-bar/selective reduced integration, C3D20 serendipity quadratic brick, C3D4 linear tet, C3D10 quadratic tet, embedded elements (rebar in solid/shell)

**Done when:**
- Force-based beam matches OpenSees forceBeamColumn on RC column cyclic tests within 2%
- Warping beam produces correct bimoment on channel/Z-section benchmarks
- MITC3 triangle passes patch tests and converges on standard shell benchmarks
- Isolator element reproduces published bilinear hysteresis loops within 2%
- Catenary element matches exact catenary solution for cable under self-weight
- Solid elements pass patch tests and converge on known elasticity benchmarks
- Cohesive zone elements reproduce mode I/II/mixed-mode delamination benchmarks
- Tsai-Wu/Hashin failure in layered shells matches published composite failure loads

### Step 12 — Native / Server Execution Maturity

Rust runs as one solver across browser and native/server contexts, not just as a browser WASM artifact. If Rust is the one solver, it should not be constrained to browser-only execution for the workloads where native execution is clearly better.

**What:**
- Establish at least one named native/server execution path, tested and maintained
- Add native/browser parity checks on representative cases
- Make server/batch execution reproducible for long analyses, reports, and enterprise workflows
- Enable clean Tauri desktop story without a second solver path

**Done when:**
- At least one named native/server execution path exists and is tested
- Representative browser vs native parity cases are green
- Heavy-model or long-running workflows have a documented native/server execution recommendation

### Step 13 — Thermal, Fire, Fatigue & Progressive Collapse

Temperature-dependent structural analysis, fatigue assessment, and automated member removal for robustness checks.

**What:**
- **Thermal stress analysis:** steady-state thermal (bridge decks, solar radiation, seasonal), transient thermal (time-varying temperature fields), sequential coupled thermo-mechanical (thermal -> degraded properties -> structural), two-way coupled thermo-mechanical (extreme deformation)
- **Fire analysis:** standard fire curves (ISO 834, ASTM E119, hydrocarbon), parametric fire curves (EC1-1-2), temperature-dependent material properties per EC2/EC3/EC4 fire parts, 1D lumped parameter or 2D FE heat transfer through sections
- **Fatigue analysis:** rainflow cycle counting (ASTM E1049), S-N curve library per EC3-1-9/AISC/DNV-RP-C203/IIW, Palmgren-Miner cumulative damage, stress-life and strain-life methods (S-N and Coffin-Manson), fatigue hot-spot stress extrapolation per IIW/DNV, weld assessment (effective notch stress, structural stress, weld category)
- **Progressive collapse:** automatic member removal (one vertical element at a time), dynamic amplification factor (2.0 per GSA/UFC 4-023-03), nonlinear static alternate path, catenary action (large-displacement tensile membrane), acceptance criteria evaluation per GSA guidelines

**Done when:**
- Material property reduction curves match EC2/EC3 tabulated values at standard temperatures
- Structural response under ISO 834 matches published fire analysis benchmarks
- Member removal + nonlinear re-analysis produces stable results on standard frame configurations
- Rainflow counting matches ASTM E1049 reference cases
- Fatigue damage accumulation matches hand calculations for standard detail categories
- Thermal stress from bridge deck gradients matches known analytical solutions

### Step 14 — Automatic Load Generation

Solver-side infrastructure for code-based automatic load generation.

**What:**
- Wind pressure computation — velocity pressure profiles (Kz, qz) from terrain/exposure parameters per ASCE 7 and EC1
- Seismic force distribution — equivalent lateral force procedure (base shear, vertical distribution, accidental torsion) per EC8/ASCE 7/NCh 433
- Snow load computation — ground-to-roof conversion with drift/sliding factors per EC1-1-3/ASCE 7
- Live load pattern generation — automatic checkerboard and adjacent-span pattern combinations
- Surface pressure mapping — map computed pressures to shell/plate element face loads based on surface orientation

**Done when:**
- ELF base shear and vertical distribution match hand calculations for standard building configurations
- Wind pressure profiles match tabulated code values within rounding tolerance
- Pattern loading generates correct unfavorable arrangements for continuous beams

### Step 15 — Performance at Scale (Iterative Solvers, GPU, Parallelism)

Handle 100k+ DOF models in-browser, scale to millions of DOFs on native/server, and enable topology optimization inner loops.

**What:**
- **Iterative solvers:** preconditioned CG (Jacobi, IC(0)), GMRES/MINRES for indefinite/non-symmetric systems, algebraic multigrid (AMG) preconditioner for million-DOF models, hybrid direct-iterative with automatic selection
- **Direct solver improvements:** multi-frontal solver with tree-level parallelism (MUMPS/PaStiX-style), nested dissection ordering via METIS/SCOTCH, supernodal Cholesky for cache utilization, sparse mass matrix for fully-sparse eigensolver paths
- **Eigensolver improvements:** block eigensolvers (LOBPCG / block Lanczos) for many-mode problems
- **Large-deformation formulations:** Total Lagrangian (reference undeformed, for rubber/soil/hyperelastic), Updated Lagrangian (reference last converged, for metal forming/progressive collapse)
- **Parallelism and hardware:** domain decomposition (FETI, Balancing DD) for multi-core/distributed, WebGPU compute shaders (element stiffness, postprocessing, sparse mat-vec), Web Workers for parallel assembly beyond rayon
- **Solver robustness at scale:** dissipation-based stabilization for shell buckling/concrete cracking, trust region methods as alternative to line search, predictor-corrector refinements for snap-through/snap-back, branch switching at bifurcation, automatic increment control from convergence rate/energy/contact status, initial stress/strain method for separating equilibrium from constitutive update

**Done when:**
- PCG converges on representative shell models with IC(0) preconditioning
- AMG-preconditioned iterative solver converges on 1M DOF shell/solid models
- Multi-frontal solver with nested dissection shows measurable speedup over current left-looking supernodal
- Hybrid solver automatically selects iterative above measured crossover point
- WebGPU element evaluation shows measurable speedup on large uniform shell meshes
- 100k DOF models solve in-browser within 60s
- TL/UL formulations pass large-strain benchmarks (rubber block, thick cylinder, metal forming)
- Domain decomposition shows near-linear scaling on multi-core for models above 500k DOFs

### Step 16 — Optimization Solver Support

Solver-level infrastructure for structural optimization workflows.

**What:**
- Analytical or semi-analytical design sensitivities (dK/dx, dM/dx)
- SIMP topology optimization with density-based penalization, OC or MMA update
- Adjoint method for efficient gradient computation with many design variables
- Eigenvalue sensitivity for frequency-constrained optimization
- p-norm stress constraint aggregation

**Done when:**
- Analytical sensitivities match finite-difference sensitivities within 1e-4 relative error
- SIMP on MBB beam and cantilever benchmarks converges to known topologies
- Frequency-constrained optimization shifts target modes as expected

### Step 17 — Reliability, Probabilistic & Bayesian Model Updating

Solver support for probabilistic structural assessment, uncertainty quantification, and digital twin model calibration from real-world sensor data.

**What:**
- **Reliability methods:** parameterized solver for material/geometry/load uncertainty, FORM/SORM, Monte Carlo batch execution, importance sampling, subset simulation, batch execution API with symbolic factorization reuse
- **Bayesian model updating & digital twins:** Bayesian parameter estimation with likelihood from FE model, MCMC sampling (Metropolis-Hastings, Hamiltonian MC, Transitional MCMC), modal-based updating (frequency + mode shape residuals, MAC-based), sensor data ingestion API (acceleration, strain, displacement time-series), Bayesian damage detection via stiffness change hypothesis testing, predictive posterior for remaining capacity/fatigue life
- **Uncertainty quantification:** polynomial chaos expansion (PCE), stochastic FEM with random field discretization, Sobol global sensitivity indices

**Done when:**
- FORM reliability index matches analytical solution for known limit-state functions
- Monte Carlo failure probability converges to FORM result with sufficient samples
- Batch execution reuses symbolic factorization across parameter variations
- MCMC posterior on a simple beam (E, I uncertain, measured deflection) matches analytical Bayesian solution
- Modal-based updating recovers known stiffness reduction from noisy frequency measurements
- PCE uncertainty bounds match Monte Carlo within 5% at 100x lower cost
- Sobol indices correctly rank parameter importance on standard benchmarks

### Step 18 — Contact and Constraint Depth

Contact and constraint capabilities matching Abaqus and Code_Aster for practical multi-part structural models.

**What:**
- **Contact enforcement:** augmented Lagrangian (eliminates penetration without high penalty), mortar contact (patch-test passing, accurate non-matching mesh transfer), Coulomb friction with slip/stick detection, exponential/velocity-dependent/anisotropic friction, self-contact for large deformation
- **Interface elements:** cohesive zone models (traction-separation for delamination/debonding/fracture), tie constraints for multi-part assemblies with non-matching meshes
- **Advanced constraints:** shell-to-solid coupling, beam-to-shell connection with offset, embedded elements (rebar in solids/shells), distributed coupling (RBE3-equivalent), kinematic coupling with DOF selection, general linear MPC equations (u_i = sum(a_j * u_j) + b), periodic boundary conditions for RVE homogenization, automatic symmetry/antisymmetry constraints on cut planes

**Done when:**
- Augmented Lagrangian contact matches Hertz analytical solution within 1%
- Mortar contact passes patch test on non-matching meshes
- Shell-to-solid coupling produces continuous displacement/stress at interface
- Embedded rebar in concrete solid matches reference RC beam solutions
- Periodic BCs reproduce known homogenization results for composite RVEs

### Step 19 — Design-Oriented Post-Processing

Solver-level result extraction and transformation for practical design workflows (RC slabs, steel connections, pressure vessels, fatigue). A solver that produces correct numbers but cannot transform them into design quantities is useless for practicing engineers. Wood-Armer moments alone unlock RC flat slab design from shell models. Real structural models are multi-part assemblies with mixed dimensions — without proper coupling (Step 18), users cannot model connections, composite sections, or multi-scale problems.

**What:**
- **Shell design results:** Wood-Armer moments for RC slab design, nodal force summation / section cuts through shell/solid models, shell result envelopes across load combinations, design-oriented result transformation to reinforcement/principal/user directions, influence surface generation for slabs under moving loads, crack width estimation from shell reinforcement strains (EC2/ACI 318), automatic punching shear perimeter detection and code-check
- **Stress processing:** stress linearization (membrane+bending+peak per ASME VIII Div.2 / EN 13445), result smoothing/averaging control by material/type/angle threshold, superconvergent patch recovery (SPR / Zienkiewicz-Zhu)
- **Analysis workflow support:** submodeling / global-local analysis, nonlinear post-buckling workflow (imperfection seeding from linear buckling modes, arc-length, knockdown factor), construction sequence with creep/shrinkage/relaxation interaction between stages
- **Error estimation:** ZZ error estimator for mesh adequacy guidance, h-refinement indicators from element-level error estimates

**Done when:**
- Wood-Armer moments match hand calculations on standard slab cases
- Section cut forces satisfy global equilibrium to machine precision
- Stress linearization matches ASME benchmark cases
- Submodel boundary displacements produce stress results within 5% of fully-refined global model
- Error estimator reliably identifies under-refined regions

---

**Post-Core Solver Steps (20-23):** These steps provide the solver-level infrastructure needed by the post-core product vision (PRODUCT_ROADMAP Steps 8-14). The solver roadmap only carries the enabling work — downstream product definitions live in the product roadmap.

### Step 20 — Incremental and Collaborative Solver

Solver supports incremental re-analysis and CRDT-compatible model mutations for real-time collaborative engineering.

**What:**
- Incremental re-analysis — partial factorization update on single-element change
- Model diff API — accept added/removed/modified elements, return updated results
- Deterministic solve ordering across all solver paths for CRDT compatibility
- Concurrent read safety — lock-free or copy-on-write result snapshots
- Partial result availability — expose displacement before full stress recovery for progressive UI updates
- Undo-safe solver state with efficient snapshot/restore

**Done when:**
- Incremental re-analysis after single-element modification runs 10x faster than full re-solve
- Model diff API produces identical results to full re-solve on all tested cases
- Concurrent result reads never produce torn/inconsistent data

### Step 21 — AI and Surrogate Support

Solver provides training data, inference hooks, and feedback loops for AI-native structural engineering.

**What:**
- Batch parametric runner with shared symbolic factorization and parallel execution
- Feature extraction API — per-element/node features in ML-ready formats (numpy-compatible binary, Arrow/Parquet)
- GNN training data pipeline — mesh graph + solution fields export
- Surrogate inference hook — ONNX/WASM surrogate with automatic fallback to full solve when confidence is low
- Design sensitivity export (dresponse/dparameter)
- Per-element anomaly scoring (residual, energy ratio, utilization outlier)
- Reinforcement learning step/reward interface

**Done when:**
- Batch runner generates 10,000 variants of a standard frame in under 1 hour
- GNN trained on solver output predicts displacement field within 5% on unseen geometries
- Surrogate hook correctly falls back to full solve when prediction error exceeds threshold

### Step 22 — Construction and Digital Twin

Solver supports staged construction simulation, as-built calibration, and live digital twin loops.

**What:**
- Time-dependent staged analysis — creep/shrinkage/relaxation interaction between stages, tendon loss tracking, age-dependent material properties
- Construction sequence solver — element activation/deactivation by stage, stage-specific loads, stress accumulation without reset
- As-built geometry update — accept surveyed coordinates or point cloud corrections, re-solve
- Live sensor integration — real-time sensor streams with scheduled Bayesian model updating (builds on Step 17)
- Predictive simulation — next-day deflections from current state + weather forecast

**Done when:**
- Staged construction of a segmental bridge matches midas Gen reference within 5%
- Creep/shrinkage predictions over 10,000 days match fib MC 2010 analytical curves
- Live sensor loop updates model parameters within 1 minute of data arrival

### Step 23 — Planetary-Scale Portfolio

Solver scales to city/portfolio-level analysis and supports climate-driven scenario generation.

**What:**
- Portfolio batch analysis — hundreds/thousands of buildings in parallel on cloud workers, aggregated risk metrics
- Climate scenario loading — future climate parameters (wind speed distributions, flood levels, fire intensity) to code-compatible load cases
- Embodied carbon computation — CO2 from material quantities integrated into optimization objective
- Automated fragility curve generation — IDA to fragility to loss estimation pipeline
- LiDAR/photogrammetry mesh import — point cloud to FE model with automatic element type assignment

**Done when:**
- Portfolio analysis of 1,000 buildings completes in under 8 hours on cloud infrastructure
- Climate-adjusted wind loads match hand calculations for standard building configurations
- Embodied carbon matches EPD values within 10%

## Backlog Reference

### Steps 1-7 (Core Solver Quality)

1. Measure buckling runtime on the sparse eigensolver path
2. Measure Guyan runtime after factorization reuse
3. Measure Craig-Bampton runtime after factorization reuse and interior-mode fix
4. Optimize the harmonic frequency sweep path further if modal-response still leaves big wins on the table
5. Deepen sparse eigensolver integration in reduction workflows
6. Fix the Lanczos tridiagonal eigensolver properly everywhere it still falls back
7. Add broader sparse shift-invert support
8. Add runtime gates for modal, harmonic, Guyan, and Craig-Bampton
9. Broaden buckling runtime/fill gates beyond the first sparse plate gate
10. Add no-`k_full`-overbuild gates everywhere they apply
11. Add stronger fill-ratio and determinism gates on the sparse path
12. Expand sparse/dense residual-parity coverage on harder shell and mixed models
13. Harden mixed shell + nonlinear workflows
14. Harden contact + nonlinear + staging workflows
15. Add iterative refinement before any remaining expensive fallback path
16. Add `PCG` with `Jacobi` preconditioning
17. Add stronger preconditioners like `IC(0)` / `SSOR` if justified by measurements
18. Implement shell-family automatic selection in the solver/model layer
19. Add layered / laminated shell workflows
20. Add axisymmetric workflows
21. Deepen nonlinear / corotational shell workflows
22. Add quasi-Newton methods such as `BFGS`, `L-BFGS`, and `Broyden`
23. Add `GMRES` / `MINRES` for indefinite systems
24. Add block eigensolvers such as `LOBPCG` / block Lanczos
25. Deepen layered/composite shell constitutive behavior
26. Add richer prestress tendon / relaxation workflows
27. Add bridge-specific staged / moving-load workflow depth
28. Add production solver-run artifact capture with build SHA, solver path, ordering, and diagnostics
29. Add deterministic repro-bundle export for production failures
30. Add versioned / contract-tested public solver payloads
31. Add workflow-level timing and browser memory baselines, not only kernel microbenchmarks
32. Add explicit TypeScript-solver deletion checklist and migration gates
33. Add native / server execution parity and batch-run coverage
34. Add pre-solve model quality gates for instability risk, duplicate nodes, bad constraints, and shell distortion risk
35. Add result audit summaries: equilibrium, residual, conditioning, and governing provenance
35. Add browser-level end-to-end tests exercising the actual WASM-in-browser path (serialization, workers, memory limits)
36. Add cross-browser WASM smoke tests (Chrome, Firefox, Safari)
37. Lock golden reference outputs from TS solver on all 90 differential fuzz seeds before TS deletion
38. Add performance regression CI gates that fail on regressions beyond defined tolerance
39. Add property-based invariant tests: equilibrium preservation, K symmetry, K positive-definiteness, energy bounds, rigid body modes, shape function partition-of-unity, patch tests
40. Add fuzz testing on solver entry points with randomized geometry/loads/materials/BCs (crash-free on 10,000+ random models)
41. Fuzz the WASM serialization boundary (malformed JSON, truncated payloads, NaN/Inf inputs)
42. Build real-model regression suite from realistic messy models (mixed elements, irregular topology, eccentric connections)
43. Add WASM vs native parity tests comparing results to machine precision on representative workflows
44. Add mutation testing (`cargo-mutants` or equivalent) and track mutation score

### Step 8 (Dynamic Analysis)

45. Implement Newmark-beta implicit time integration (beta=1/4, gamma=1/2)
46. Implement HHT-alpha method with numerical dissipation control
47. Implement explicit central difference method with critical dt calculation
48. Add Rayleigh damping (alpha*M + beta*K) to all dynamic solvers
49. Add modal damping with per-mode damping ratios
50. Implement consistent mass matrix alongside existing lumped mass
51. Add nonlinear dynamics (Newton-Raphson within time steps)
52. Add operator-splitting for efficiency in nonlinear dynamics
53. Implement energy balance monitoring for numerical stability detection
54. Add adaptive time stepping based on convergence behavior
55. Implement checkpoint/restart for long dynamic analyses
56. Add ground motion input as base excitation
57. Add response history extraction at selected nodes/DOFs

### Step 9 (Nonlinear Materials)

58. Implement material state management (commit/revert/copy) framework
59. Implement Kent-Park / modified Kent-Park confined/unconfined concrete
60. Implement Mander confined concrete model
61. Implement Concrete02 with tension stiffening
62. Implement concrete damage plasticity (CDP)
63. Implement fib Model Code 2010 stress-strain curves
64. Implement Eurocode 2 parabola-rectangle design curves
65. Implement bilinear steel (elastic-perfectly-plastic, strain-hardening)
66. Implement Menegotto-Pinto (Steel02) hysteretic model
67. Implement Giuffre-Menegotto-Pinto combined hardening
68. Implement Steel4 with asymmetric behavior and fracture
69. Add fiber section with multiple materials (concrete core + cover + rebar)
70. Add 3D fiber section (biaxial bending: epsilon_0, kappa_y, kappa_z)
71. Add moment-curvature analysis from fiber section integration
72. Add M-N-V interaction surface generation

### Step 10 (Pushover)

73. Implement displacement-controlled pushover with arc-length control
74. Add load patterns: inverted triangular, uniform, modal-proportional (EC8, ASCE 7)
75. Add plastic hinge tracking with ductility demand per step
76. Implement capacity curve extraction with bilinear idealization
77. Implement capacity spectrum method (ATC-40 / FEMA 440)
78. Implement N2 method (Eurocode 8)
79. Implement multi-modal pushover analysis (MPA)

### Step 11 (Advanced Elements)

80. Implement seismic isolator elements (bilinear, friction pendulum)
81. Implement viscous damper elements (F = C*v^alpha)
82. Implement BRB elements with backbone curve and hysteresis
83. Implement panel zone elements (Krawinkler model)
84. Implement infill wall elements (equivalent diagonal strut)
85. Implement full catenary element (exact stiffness, not Ernst)
86. Add form-finding (force density, dynamic relaxation)
87. Add membrane elements for fabric structures
88. Add tapered beam elements
89. Add curved beam elements
90. Add 3D solid elements (C3D8, C3D20, C3D4, C3D10)

### Step 13 (Thermal, Fire, Fatigue & Progressive Collapse)

91. Implement standard fire curves (ISO 834, ASTM E119, hydrocarbon)
92. Implement parametric fire curves (EC1-1-2)
93. Add temperature-dependent material properties per EC2/EC3/EC4
94. Implement 1D/2D thermal analysis through sections
95. Add coupled thermo-mechanical sequential analysis
96. Implement automatic member removal for progressive collapse
97. Add dynamic amplification factor per GSA/UFC
98. Add nonlinear static alternate path analysis
99. Add catenary action (large-displacement tensile membrane)
100. Add acceptance criteria evaluation per GSA guidelines

### Step 14 (Automatic Load Generation)

101. Implement wind pressure computation (ASCE 7, EC1)
102. Implement seismic ELF distribution (EC8, ASCE 7, NCh 433)
103. Implement snow load computation (EC1-1-3, ASCE 7)
104. Add live load pattern generation (checkerboard, adjacent-span)
105. Add surface pressure mapping to element face loads

### Step 15 (Performance & Scale)

106. Implement PCG with Jacobi and IC(0) preconditioners
107. Implement GMRES / MINRES for indefinite systems
108. Add hybrid direct-iterative solver with automatic selection
109. Add block eigensolvers (LOBPCG / block Lanczos)
110. Implement WebGPU compute shaders for element stiffness and mat-vec
111. Add Web Workers for parallel assembly
112. Add sparse mass matrix for fully-sparse eigensolver paths
113. Implement supernodal Cholesky for cache utilization

### Step 16 (Optimization)

114. Implement analytical design sensitivities (dK/dx, dM/dx)
115. Implement SIMP topology optimization with OC/MMA update
116. Add adjoint method for efficient gradient computation
117. Add eigenvalue sensitivity for frequency-constrained optimization
118. Add p-norm stress constraint aggregation

### Step 17 (Reliability, Probabilistic & Bayesian)

119. Add parameterized solver for material/geometry/load uncertainty
120. Implement FORM/SORM reliability methods
121. Add Monte Carlo batch solver execution
122. Add importance sampling for rare failure events
123. Implement subset simulation
124. Add batch execution API with symbolic factorization reuse
125. Implement Bayesian parameter estimation with likelihood from FE model
126. Add MCMC sampling (Metropolis-Hastings, Hamiltonian MC, Transitional MCMC)
127. Implement modal-based model updating (frequency + mode shape residuals, MAC-based)
128. Add sensor data ingestion API (acceleration, strain, displacement time-series)
129. Implement Bayesian damage detection via stiffness change hypothesis testing
130. Add predictive posterior propagation for remaining capacity / fatigue life
131. Implement polynomial chaos expansion (PCE) for efficient UQ
132. Add stochastic FEM with random field discretization
133. Implement Sobol global sensitivity indices

### Step 18 (Contact, Interface & Constraints)

134. Implement augmented Lagrangian contact enforcement
135. Implement mortar contact for non-matching meshes
136. Add Coulomb friction with proper slip/stick detection
137. Add self-contact for large deformation (pipe buckling, shell folding)
138. Implement cohesive zone elements (traction-separation for delamination/debonding)
139. Add tie constraints for multi-part assemblies with non-matching meshes
140. Implement shell-to-solid coupling constraints
141. Add beam-to-shell connection with offset
142. Implement embedded elements (rebar in concrete solids/shells)
143. Add distributed coupling (RBE3-equivalent)
144. Add kinematic coupling with DOF selection
145. Add general linear MPC equations (u_i = sum(a_j * u_j) + b)
146. Implement periodic boundary conditions for RVE homogenization
147. Add automatic symmetry/antisymmetry constraints on cut planes

### Step 19 (Design-Oriented Post-Processing)

148. Implement Wood-Armer moments for RC slab design from shell results
149. Add nodal force summation / section cuts through shell/solid models
150. Implement shell result envelopes across load combinations
151. Add design-oriented result transformation to reinforcement/principal/user directions
152. Add influence surface generation for slabs under moving loads
153. Implement crack width estimation from shell reinforcement strains (EC2/ACI 318)
154. Add automatic punching shear perimeter detection and code-check
155. Implement stress linearization (membrane+bending+peak per ASME/EN 13445)
156. Add result smoothing/averaging control by material, type, and angle threshold
157. Implement superconvergent patch recovery (SPR / Zienkiewicz-Zhu)
158. Add submodeling / global-local analysis workflow
159. Add nonlinear post-buckling workflow (imperfection seeding, arc-length, knockdown)
160. Add construction sequence with creep/shrinkage/relaxation interaction between stages
161. Implement ZZ error estimator for mesh adequacy guidance
162. Add h-refinement indicators from element-level error estimates

### Cross-Phase Items

163. Implement general return mapping algorithm (yield surface, flow rule, hardening, consistent tangent)
164. Add Caughey damping (generalized Rayleigh for more than 2 target frequencies)
165. Add frequency-dependent and non-proportional damping with complex eigenvalue analysis
166. Add random vibration / PSD analysis (wind/wave/traffic excitation)
167. Add response spectrum CQC3, GMC, Gupta methods and missing mass correction
168. Implement force-based beam-column element (OpenSees-equivalent)
169. Add Timoshenko beam with warping DOF (7-DOF) for open thin-walled sections
170. Add full shell triangle (MITC3/DSG3 with membrane+bending+drilling)
171. Add 6-node triangular shell (MITC6/STRI65)
172. Implement composite laminate failure criteria (Tsai-Wu, Tsai-Hill, Hashin, Puck)
173. Add UMAT-equivalent user-defined material interface
174. Implement Drucker-Prager and Mohr-Coulomb plasticity for geotechnical analysis
175. Implement Modified Cam-Clay for clay soils
176. Add orthotropic/anisotropic elasticity for timber, masonry, composites
177. Implement Total Lagrangian and Updated Lagrangian large-strain formulations
178. Add multi-frontal solver with nested dissection ordering
179. Implement AMG preconditioner for million-DOF models
180. Add domain decomposition (FETI) for distributed parallelism
181. Add smeared/rotating crack and damage mechanics models (Mazars, Lemaitre)
182. Implement Gauss-point substepping for material integration robustness
183. Add dissipation-based stabilization for shell buckling and concrete cracking
184. Implement plastic hinge beam element with FEMA 356/ASCE 41 hinge tables
185. Add fatigue cycle counting (rainflow) and S-N damage accumulation
186. Add thermal stress analysis (steady-state/transient, bridge deck gradients)

### Step 20 (Incremental & Collaborative Solver)

187. Implement incremental re-analysis (partial factorization update on single-element change)
188. Add model diff API (accept added/removed/modified elements, return updated results)
189. Extend deterministic solve ordering to all solver paths for CRDT compatibility
190. Add concurrent read safety (lock-free or copy-on-write result snapshots)
191. Add partial result availability (expose displacement before full stress recovery)
192. Implement undo-safe solver state with efficient snapshot/restore

### Step 21 (AI & Surrogate Support)

193. Implement batch parametric runner with shared symbolic factorization
194. Add feature extraction API (per-element/node features in ML-ready formats)
195. Add GNN training data pipeline (mesh graph + solution fields export)
196. Implement surrogate inference hook (ONNX/WASM surrogate with automatic fallback)
197. Add design sensitivity export (dresponse/dparameter)
198. Implement per-element anomaly scoring (residual, energy ratio, utilization outlier)
199. Add reinforcement learning step/reward interface

### Step 22 (Construction & Digital Twin Solver)

200. Implement time-dependent staged analysis (creep/shrinkage/relaxation across stages)
201. Add construction sequence solver (element activation/deactivation by stage)
202. Add as-built geometry update (accept surveyed coordinates, re-solve)
203. Implement live sensor integration with scheduled Bayesian model updating
204. Add predictive simulation (next-day deflections from current state + forecast)

### Step 23 (Planetary-Scale & Portfolio)

205. Implement portfolio batch analysis (distributed cloud workers, aggregated risk metrics)
206. Add climate scenario loading (future wind/flood/fire to code-compatible load cases)
207. Implement embodied carbon computation integrated into optimization objective
208. Add automated fragility curve generation (IDA to fragility to loss estimation pipeline)
209. Add LiDAR/photogrammetry mesh import (point cloud to FE model)

## Measured Benchmarks (Reference)

Factorization speedup (Criterion, factorization only):

| Family | Mesh | nf | Dense LU | Sparse Chol | Speedup |
|--------|------|----|----------|-------------|---------|
| MITC4 | 6x6 | ~210 | 1.19ms | 0.88ms | 1.4x |
| MITC4 | 10x10 | 684 | 18.8ms | 4.17ms | 4.5x |
| MITC4 | 15x15 | ~1400 | 184ms | 16.4ms | 11x |
| MITC4 | 20x20 | 2564 | 986ms | 43.8ms | 22x |
| MITC4 | 30x30 | 5644 | 12.2s | 157ms | 77x |
| Quad9 | 5x5 | ~700 | 18.9ms | 4.2ms | 4.5x |
| Quad9 | 10x10 | ~2600 | 974ms | 56ms | 17x |
| Quad9 | 15x15 | ~5700 | 12.5s | 141ms | 89x |
| Curved | 8x8 | ~450 | 5.9ms | 10.1ms | 0.58x |
| Curved | 16x16 | ~1700 | 277ms | 109ms | 2.6x |
| Curved | 24x24 | ~3600 | 3.0s | 406ms | 7.4x |

Parallel assembly (Apple Silicon, release build):

| Model | Elements | DOFs | Serial | Parallel | Speedup |
|-------|----------|------|--------|----------|---------|
| 20x20 flat plate | 400 quads | ~2.6k | 82 ms | 80 ms | 1.03x |
| 30x30 flat plate | 900 quads | ~5.8k | 411 ms | 386 ms | 1.06x |
| 50x50 flat plate | 2500 quads | ~15.6k | 2.96 s | 2.91 s | 1.02x |
| 8-storey mixed | 512 quads + 32 frames | ~3.3k | 161 ms | 157 ms | 1.03x |

Key observations:
- Sparse wins on all families above ~500 DOFs; dense still wins at curved 8x8 (~450 DOFs)
- Fill ratio grows with mesh size (not constant); AMD is the measured fill winner on larger shell meshes
- 0 perturbations everywhere — Cholesky is clean
- At 30x30 MITC4 (5644 DOFs), sparse assembly + solve takes 0.56s vs 12.3s dense — 22x end-to-end
- MITC4 element stiffness is lightweight (~200 ops), so parallel assembly overhead nearly cancels speedup; Quad9 and curved-shell elements (5-10x heavier per element) will show stronger scaling

Phase 3c workflow measurements (20x20 MITC4, nf=2564):
- **Harmonic**: modal 2.4s vs direct 561s = **234x speedup** (50 freq steps)
- **Guyan**: full solver 6.4s (interior solves 5.5s dominate: Cholesky 1.2s + 399 back-subs 4.3s)
- **Craig-Bampton**: full solver 17.2s (constraint modes 5.7s, interior eigen 1.9s, reduced asm 4.2s)
- **Modal**: sparse 0.25s vs dense 2.5s = **9.8x speedup** (5 modes)
- **Buckling**: 8x8 plate 0.26s (parity within 2.6%)

## Non-Goals Right Now

- No broad multiphysics expansion (CFD, thermal-fluid, electromagnetics)
- No isogeometric analysis (IGA shines for automotive/aerospace, not buildings)
- No meshfree methods (peridynamics, MPM — niche, out of scope for routine structural)
- No GPU sparse direct factorization (CPU sparse direct is correct for structural problem sizes)
- No solver-scope expansion driven by product/UI convenience ahead of core quality
- No feature-count work ahead of validation, robustness, and scale
- No roadmap drift into a changelog or benchmark ledger

## Related Docs

- `README.md` — repo entry point and document map
- `BENCHMARKS.md` — capability and benchmark evidence
- `VERIFICATION.md` — verification philosophy and testing stack
- `PRODUCT_ROADMAP.md` — app, workflow, market, and product sequencing
- `CHANGELOG.md` — historical progress
- `research/shell_family_selection.md` — shell-family selection notes
- `research/competitor_element_families.md` — competitor shell-family comparison
- `research/numerical_methods_gap_analysis.md` — numerical-methods gap analysis
- `research/rc_design_and_bbs.md` — RC design/BBS research
- `research/post_roadmap_software_stack.md` — post-core software stack
