> **Archived 2026-11-22, not current.** Pre-v0.2.0 solver status snapshots extracted from [`SOLVER_ROADMAP.md`](../../roadmap/SOLVER_ROADMAP.md). For current verification metrics see [`DASHBOARD.md`](../../../testing/docs/DASHBOARD.md) and [`MATURITY.md`](../../../testing/docs/MATURITY.md); for current solver tracks and contract change protocol see [`SOLVER_ROADMAP.md`](../../roadmap/SOLVER_ROADMAP.md). See [`docs/archive/README.md`](../README.md).

# Pre-v0.2.0 Solver Roadmap Snapshots (April–July 2026)

Extracted verbatim from `docs/roadmap/SOLVER_ROADMAP.md`. The live contract-change protocol and still-open Step 6 topology/constraint items remain in [`SOLVER_ROADMAP.md`](../../roadmap/SOLVER_ROADMAP.md).

## Where We Are

Sparse direct solver, deterministic assembly, multi-family shell stack (MITC4+EAS-7, MITC9, SHB8-ANS, curved shell), sparse eigensolver paths for modal/buckling/harmonic, beam station extraction for RC design, grouped/member-level 3D extraction, design-demand bridging for RC/steel checks, Modified Newton-Raphson, the WASM production path, TypeScript solver retirement, AMD default ordering, sparse 2D/3D buckling, sparse 3D reduction block extraction, and the first sparse buckling runtime gate are all done. See `BENCHMARKS.md` for the full snapshot and measured benchmark data.

The live near-term blockers are now:
- final Step 3 trust work: solver-run artifact capture, inclined-support equilibrium reporting correctness, and keeping trust/provenance signals stable across all solver paths
- constraint-system maturity: prescribed-displacement semantics through constrained chains and deeper circular-dependency detection
- 3D release/hinge contract cleanup: remove lingering generic hinge semantics from outputs/analyzers/UI, converge on typed per-end releases, and then add topology diagnostics for unreachable DOFs
- sparse/runtime hardening on real workflows
- keeping verification/trust signals visible as contracts and CI gates evolve
- ~~immediate 3D coordinate-system alignment with the `Z-up` product/runtime convention~~ — SUBSTANTIALLY RESOLVED (2026-04-18): comprehensive audit and 60+ fixes across viewport, store, exports, backend AI, IFC, stress, and locales; see Coordinate Convention section below for remaining items

## ASAP Hardening Work

Before broadening the solver into more design-code and advanced-analysis depth, the following fixes should land as soon as possible because they affect trust in the current validation and delivery path:

1. `Eliminate false-green tests` — DONE. Missing fixtures in differential/property parity tests now fail loudly instead of silently counting as passing verification.
2. `Finish the last extraction hardening gaps` — DONE for the current Step 2 scope. The 3D solve→stations→demands bridge, grouped snapshots, no-phantom-governing checks, schema/evolution rules, governing combo names, and representative RC/steel regression fixtures are in place. Remaining metadata for cover assumptions and bar schedules belongs with later RC design integration.
3. `Strengthen test oracles` — MOSTLY DONE. Equilibrium checks now cover distributed loads and moment balance better; the remaining work is to codify tolerance policy by test type so regression tests do not inherit benchmark-grade looseness.
4. `Move wall-clock timing checks out of normal pass/fail tests` — DONE. Timing-sensitive sparse-vs-dense assertions have been moved into ignored perf paths or relaxed where appropriate.
5. `Close current sparse reduction/runtime gaps` — STILL OPEN. Keep removing avoidable densification where applicable, add broader buckling/runtime/fill gates, and enforce no-`k_full`-overbuild expectations where they truly apply.
6. `Keep solver trust visible` — ONGOING. Every hardening change above should add proof, not only code: CI gates, contract tests, analytical/reference checks, or reproducible artifacts. Wave 1 trust hardening (2026-04-19) landed 102 contract tests across 4 suites, all required in CI — see baseline section below.
7. `Lock the 3D coordinate convention explicitly` — SUBSTANTIALLY DONE (2026-04-18). Comprehensive Z-up audit fixed 60+ inconsistencies: viewport rendering (WASD, distributed loads, results-sync projections), store operations (splitElement, mirror, rotate Z preservation), file persistence (analysisMode/axisConvention3D in .ded files and share links), exports (PRO mode via `isMode3D()` in CSV/HTML/Excel), IFC import (Y-up→Z-up remapping), backend AI contracts (fz/my canonical fields, bounds), section-stress (My/Mz yMax/zMax swap), locale labels (rotMomentHelp), and basic 3D node creation (`shouldProjectModelToXZ` excluding '3d' mode). Remaining: watch for regressions and ensure new 3D features follow the convention.

See also: `../../research/solver_safety_and_validation_hardening.md` for the fuller defense-layer architecture around validation, convergence safeguards, post-solve verification, diagnostics, and frontend mutation guards.

## Wave 1 Trust Hardening — Baseline (2026-04-19)

102 new tests across 4 test suites, all required in CI. These are contract tests — weakening them requires explicit justification and a roadmap update.

### What is now enforced

**Solver invariants** (`engine/tests/solver_invariants.rs` — 21 tests, contract):
- Equilibrium preservation: reactions balance applied loads on 2D/3D cantilever, SS beam, portal (5 models + parametric)
- Stiffness matrix symmetry: dense K and sparse K_ff on 2D/3D single-element and multi-element (4 models + parametric)
- Energy bounds: non-negative strain energy, work-energy theorem on cantilever (2 models + parametric)
- Zero-load → zero-displacement (2D + 3D)
- Deterministic solve: bitwise f64 reproducibility (2D + 3D)
- Reaction count matches constrained DOFs (2D + 3D)

**Solver CI coverage** (`engine/tests/solver_ci_coverage.rs` — 11 tests, contract):
- Modal analytical: SS beam f₁ and cantilever f₁ within 2% of Euler beam theory
- Buckling analytical: pinned-pinned and cantilever Euler P_cr within 2%
- Sparse/dense parity: bitwise determinism + 1e-10 residual parity on 3D portal
- Constraint smoke: RigidLink, Diaphragm, EqualDOF equilibrium and behavior
- Sparse infrastructure: 10x10 MITC4 fill ratio ≤ 8.0, 0 perturbations, deterministic

**Convention regression gates** (`web/.../convention-regression-gates.test.ts` — 27 tests, contract seams 1/3/4/6):
- SEAM 1: 2D output bans Y-up fields; 3D output has canonical 3D field names; backend uses fz/my
- SEAM 2: PRO mode handled as 3D everywhere; no raw `=== '3d'` checks outside isMode3D
- SEAM 3: My/Mz axis identity preserved in auto-verify, ProVerification, ProPanel, Navier formula, stress heatmap. Auto-verify is exercised with both governing axes, rectangular section rotation, paired shear and retained source moments through concurrent verification; vertical-only slenderness remains guarded. The former local-variable source strings were retired with the shared concurrent-demand path in #2080, without weakening the axis contract.
- SEAM 4: File persistence writes analysisMode/axisConvention3D; share links serialize plates/quads/constraints
- SEAM 5: Locale wording correct for rotMomentHelp and moments3dHelp in EN/ES
- SEAM 6: Z-up constants (VERTICAL_AXIS, UP_VECTOR, GRAVITY_VECTOR_3D, projectNodeToScene)

**WASM boundary robustness** (`web/.../solver-boundary-robustness.test.ts` — 43 tests, contract section 5):
- NaN/Inf handling: 2D + 3D solvers throw or return finite (never hang) on bad coordinates, materials, sections, loads
- Degenerate geometry: zero-length, 1e12, 1e-12 elements handled gracefully
- Empty/minimal models: no-elements, no-loads, no-supports, single-element PL³/3EI check
- Extreme values: stiff/flexible, long/short, large loads, zero E, zero A, negative E
- Field name contract: 2D displacements ux/uz/ry, reactions rx/rz/my, forces n/v/mStart/End; 3D full 6-DOF field names

### What remains open

**Step 4 — runtime and scale (partially done)**
- Measure Guyan/CB runtime after factorization reuse
- Measure harmonic bottlenecks after modal-response acceleration
- Deeper sparse eigensolver integration in reduction workflows
- Broader sparse shift-invert support
- Browser memory ceiling / worker startup measurement
- Iterative refinement before expensive fallback paths
- Headless batch-run ergonomics

**Step 5 — verification moat**
- `Property-based fuzz testing (10,000+ random models, crash-free)`
- `WASM vs native parity tests`
- `Mutation testing (cargo-mutants)`
- `Real-model regression suite from messy/realistic models`

**Step 6 — constraint maturity / solver-path consistency**
- `Broader shell + nonlinear invariant coverage`
- `Constraint system depth (chained, eccentric, cross-solver parity)`
- ~~`3D release-contract cleanup and honest surfaces`~~ — DONE (2026-07-27)
  - Type: contract cleanup + UI truthfulness
  - Status: DONE — 3D viewport renders per-axis releases with accurate cache signature (f7bc88a); StepWizard detailed 3D solver condenses per axis incl. torsion with WASM-parity testing (f5186cf); Excel exports per-axis release columns (c41941c); AI snapshot carries typed releases both directions (b9da0a0); disclosure i18n deployed to all 14 locales (a74d403). Remaining exception: engine `CurvedBeamInput.hinge_start/hinge_end` booleans are deliberately untouched (engine schema scope; no breaking change to input contract).
  - Done when: ✓ 3D outputs, editor/detail/table views, and visualization/store helpers expose the explicit release contract consistently; generic hinges removed from web surfaces
- ~~`Typed Release per element end`~~ — DONE (2026-07-27)
  - Type: structural cleanup
  - Status: DONE — model layer (Element.releaseI/releaseJ per axis), 3D wire contract (releaseMyStart..releaseTEnd), output contract, DedalFile v2 + URL-share sv:4 migrations, and editor/table/property UI all landed end-to-end. Remaining exception: engine `CurvedBeamInput` booleans remain (engine schema; no web-layer breakage).
  - Done when: ✓ solver, web, and analyzer code share typed Release as source of truth; end releases use explicit per-axis contract instead of generic hinges
- `Pre-solve release/topology diagnostics`
  - Type: diagnostics layer
  - Status: planned after typed releases; the goal is actionable unreachable-DOF diagnostics for release/support topology, not replacement of numerical rank checks
  - Done when: a pre-solve analyzer reports unreachable DOFs using supports, springs-to-ground, and MPC/reduction edges, while matrix/rank checks remain the final numerical authority
- `Free-slave -> restrained-master prescribed displacement`
  - Type: contract decision + implementation
  - Status: deferred because the correct semantics need to be chosen before coding
  - Done when: one semantic rule is documented and every affected solver path follows it
- `Circular constraint detection beyond depth 2`
  - Type: algorithm extension
  - Status: deferred because the current pairwise check must be replaced with graph-level cycle detection
  - Done when: arbitrary-depth cycles are rejected and long valid chains still pass

### Contract change protocol

If a contract test needs to change, update all three together:
1. **The contract test itself** — with a comment explaining why the old assertion no longer holds
2. **The runtime code / docs** — whatever made the old contract true must be updated to match
3. **This baseline** — update the enforced-invariants list so the roadmap stays accurate

A contract weakening (looser tolerance, removed assertion, skipped test) requires explicit justification in the commit message. A contract strengthening (tighter tolerance, new assertion) is always welcome.

### CI gate structure

Rust test job runs these named gates before the full suite:
1. Shell benchmarks gate
2. Shell acceptance gate
3. Constraint benchmarks gate
4. Sparse shell gates
5. **Solver invariants gate** ← new
6. **Solver CI coverage gate** ← new
7. All tests (catch-all)

Web test job:
8. **Web tests** (includes convention gates + boundary robustness) ← new, was not run in CI before

### Branch protection (not yet enabled; tracked in [#355](https://github.com/lambdaclass/stabileo/issues/355))

Main has no branch protection. When enabled, require these status checks:
- `lint` — clippy
- `test` — all Rust gates + catch-all
- `web` — WASM build + web tests

This would prevent direct pushes to main. Enable when the team is ready to work through PRs.
