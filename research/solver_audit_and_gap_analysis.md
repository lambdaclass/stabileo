# Solver Audit and Gap Analysis

Deep code review of the solver engine, test suite, design checks, frontend validation, and numerical behavior. This document catalogs gaps not currently covered in `SOLVER_ROADMAP.md`, `PRODUCT_ROADMAP.md`, or `research/solver_safety_and_validation_hardening.md`. Sections 9-10 cover solution initialization, warm-start capability, preconditioning, and iterative solver infrastructure.

## 1. Dead Code That Should Be Wired

Three modules are fully implemented and unit-tested but not called by any solver.

### 1.1 AdaptiveStepper (adaptive_stepping.rs)

**What it does:** Controls load increment size based on convergence behavior. Doubles step on easy convergence, halves on failure, aborts when minimum step is reached. Has `from_n_increments()` for backward compatibility with existing fixed-step interfaces.

**Current state:** Declared in `solver/mod.rs` line 24. Has 5 passing unit tests. Zero imports from any solver.

**What uses fixed stepping instead:**

| Solver | Current loop | Line |
|--------|-------------|------|
| `corotational.rs` | `load_factor = increment as f64 / n_increments as f64` | 44-45, 863-864 |
| `material_nonlinear.rs` | `load_factor = inc as f64 / n_increments as f64` | 112-113, 847-848 |
| `fiber_nonlinear.rs` | `load_factor = inc as f64 / input.n_increments as f64` | 115-116, 576-577 |

**`arc_length.rs` has its own adaptive logic** (Crisfield spherical constraint with `ds *= 0.5` halving) which is correct and more sophisticated for arc-length specifically.

**Impact:** Fixed stepping means these three solvers cannot recover from a too-large increment. If increment 7/20 diverges, the solver iterates until `max_iter` and returns `converged: false` with the last (potentially garbage) displacement state. With `AdaptiveStepper`, it would halve the step and retry.

**Not mentioned in:** SOLVER_ROADMAP.md, PRODUCT_ROADMAP.md, or the safety hardening research note. The roadmap mentions "adaptive time stepping" three times but always in the context of dynamic analysis (Step 8, item 54), never for the existing static nonlinear solvers.

### 1.2 Line Search (line_search.rs)

**What it does:** Armijo backtracking line search with cubic interpolation fallback. Given a Newton-Raphson displacement update `delta_u`, finds step length `alpha` in (0, 1] such that the residual energy decreases sufficiently. Reference: Nocedal & Wright, "Numerical Optimization" Ch. 3.

**Current state:** Fully implemented with `residual_energy()`, `directional_derivative()`, `armijo_backtrack()`, and `cubic_backtrack()`. Declared in `solver/mod.rs` line 23. Zero imports from any solver.

**Impact:** Without line search, a full Newton-Raphson step can overshoot and increase the residual. This is the most common cause of N-R divergence in nonlinear structural analysis. Armijo backtracking costs one residual evaluation per backtrack step (cheap compared to a full K factorization) and dramatically improves convergence robustness.

**Not mentioned in:** Any roadmap document. The safety hardening research note discusses "detect divergence" and "detect stagnation" but does not mention line search as a prevention mechanism.

### 1.3 Automatic Overstress Check (section_stress.rs)

**What it does:** Computes Von Mises, Tresca, and Rankine stresses at fiber locations and compares against material yield strength. Returns `ratio_vm = von_mises / fy` and `ok = (von_mises <= fy)`.

**Current state:** Fully implemented in `postprocess/section_stress.rs`. Available as a postprocess module but never called automatically after `solve_2d` or `solve_3d`.

**Impact:** The linear solver silently returns results where steel may be yielding. An engineer who runs a linear analysis and looks at displacements and forces has no indication that the material assumption (linear elastic) is violated. The check already exists — it only needs to be called and its results included in the output.

**Not mentioned in:** Any roadmap document. The product roadmap discusses "utilization ratios" and "pass/fail per member" as future features, but the existing `section_stress.rs` capability that could provide immediate overstress warnings is not referenced.

## 2. Solver Safeguards Not In Roadmap

### 2.1 Divergence Detection in Nonlinear Solvers

The safety hardening research note states that all nonlinear solve paths should "detect divergence" and "detect stagnation" (lines 66-67). However, neither document specifies this as an explicit work item with implementation guidance.

**Current state by solver:**

| Solver | Detects divergence? | What happens on non-convergence |
|--------|--------------------|---------------------------------|
| P-Delta | No | Returns `converged: false` silently |
| Corotational | No | Returns last increment with `converged: false` |
| Material NL | No | Continues to next increment, flags globally |
| Fiber NL | No | Breaks, returns `converged: false` |
| Arc-length | **Yes** (halves ds) | Retries smaller step, aborts if ds < min_ds |
| Cable | No | Returns `converged: false` |

A `ConvergenceTracker` that monitors residual norms across iterations and flags monotonically increasing residuals (3+ consecutive increases with growth factor > 1.5) would catch divergence early and return an explicit error instead of silently iterating to `max_iter`.

### 2.2 Force-Based Convergence for P-Delta

P-Delta (`pdelta.rs`) checks convergence using displacement norm only:

```rust
if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
    converged = true;
    break;
}
```

This can declare convergence while force equilibrium is not satisfied. All other nonlinear solvers use force-based (residual) convergence. P-Delta should also verify `||R|| / ||F|| < tolerance`.

**Not mentioned in:** Any roadmap document.

### 2.3 NaN/Inf Guard in Rust Solve Path

If the Cholesky/LU solver produces NaN (from a near-singular matrix that wasn't caught, or from NaN propagation in assembly due to zero-length elements), the result is serialized to JSON and sent to the frontend. The only NaN check is in the frontend (`ToolbarResults.svelte` checks `isFinite()` on displacements).

A `check_solution_finite()` call on the displacement vector immediately after solving — before any post-processing — would catch this at the source.

**Not mentioned in:** Any roadmap document. The safety hardening research note discusses "reject NaN / Inf propagation immediately" (line 68) but as a general principle, not as a specific work item for the linear solve path.

### 2.4 Conditioning Rejection Threshold

`conditioning.rs` computes diagonal ratio and logs warnings at 1e8 and 1e12. The solver continues regardless. There is no threshold at which the solver refuses to return results.

For diagonal ratios above ~1e14, the last 2-3 significant digits of the displacement solution are noise. The solver should either return an error or include a prominent warning in the results payload.

**Not mentioned in:** SOLVER_ROADMAP Step 3 mentions "conditioning summaries in result payloads" but as informational metadata, not as a rejection gate.

### 2.5 Default Newton-Raphson Parameters

The three nonlinear solvers (corotational, material_nonlinear, fiber_nonlinear) require the user to specify `max_iter`, `tolerance`, and `n_increments` via the WASM API. There are no automatic defaults based on model characteristics.

Reasonable defaults:
- `max_iter = 30` (already the default in fiber_nonlinear)
- `tolerance = 1e-6` (already the default in arc_length)
- `n_increments = max(10, estimated_from_load_ratio)` — could be computed from the ratio of applied load to estimated capacity

**Not mentioned in:** Any roadmap document.

## 3. User-Facing Warnings Not In Roadmap

### 3.1 Automatic Overstress Warning After Linear Solve

When the linear solver returns, there is no indication whether material yield has been exceeded. An engineer must manually invoke design checks. Since `section_stress.rs` already exists, a post-solve scan that flags elements where `von_mises > fy` and includes these in the results payload would be low-effort and high-impact.

### 3.2 P-Delta Recommendation Based on Axial Load Ratio

After a linear solve, the solver could compute `N/Ncr` for each compression member (where `Ncr = pi^2 * EI / L^2` with appropriate K factor). If any ratio exceeds 0.1, second-order effects are non-negligible. If any ratio exceeds 0.3, linear results may be significantly unconservative.

Reference: AISC 360-22 Appendix 8, Commentary C2: "When the ratio of second-order drift to first-order drift exceeds 1.5 (corresponding roughly to N/Ncr > 0.33), the amplified first-order approach becomes unreliable."

This is not about running P-Delta automatically — it is about telling the engineer that their linear results may be unconservative.

### 3.3 B2 Amplification Warning Zone

P-Delta currently only flags instability when `B2 >= 100`. For B2 values between 2 and 100, results are returned without comment. A structure with B2 = 15 is approaching instability and the engineer should know.

Suggested thresholds:
- B2 > 2.0: "Significant second-order amplification (B2 = X.X)"
- B2 > 5.0: "Structure approaching instability (B2 = X.X) — verify adequacy"
- B2 >= 100: existing "unstable" flag

### 3.4 Rigid Connection Assumption Notice

All beam-column joints are modeled as fully rigid (moment-continuous) by default. This is a standard FEM assumption but can lead to significant errors when real connections are pinned or semi-rigid. A one-time notice in the diagnostics — "All connections modeled as rigid; override with connectors if needed" — helps engineers who may not realize this.

### 3.5 Thermal Restraint Indicator

When a beam with fixed-end supports has thermal loads applied, the restrained expansion creates thermal stress `sigma = E * alpha * DeltaT`. The solver computes this correctly, but provides no indication that restraint effects are dominant. A diagnostic noting which elements have thermal-to-total stress ratio > 50% would help.

### 3.6 Mesh Quality Summary

Assembly diagnostics already compute aspect ratio and Jacobian ratio per element. A summary statistic — "X% of elements have aspect ratio > 5" — would help users assess mesh quality without inspecting individual element warnings.

### 3.7 Stress Concentration at Prescribed Displacements

Support settlements applied as prescribed displacements can create artificial stress concentrations at adjacent elements. A diagnostic noting which elements are adjacent to prescribed-displacement supports and have stress spikes would help distinguish real behavior from numerical artifacts.

## 4. Design Code Gaps

### 4.1 Steel Shear Check (AISC G2)

`steel_check.rs` implements tension (D2), compression (E3), flexure (F2/F6), and combined loading (H1). Shear capacity per AISC G2 is not implemented. For steel beams, shear is rarely governing but for short deep beams, coped beams, and connections, it is critical.

**Not mentioned as a specific gap in:** Any roadmap document. Product Step 1 lists "steel member design" without specifying which checks.

### 4.2 Pass/Fail Boolean Standardization

Three of six design check modules return a `pass` boolean (CFS, masonry, foundation). Three do not (steel, RC, timber). The product roadmap references "pass/fail per member" as a product goal but does not note that the existing code is inconsistent.

### 4.3 Self-Weight for Frame Elements

Shell and plate elements support automatic self-weight via `SolverQuadSelfWeightLoad` with density and gravity direction. Frame elements do not — the user must manually compute and add distributed loads for self-weight. For everyday engineering, this is a friction point.

**Not mentioned in:** Any roadmap document.

## 5. Analytical Solution Tests Not In Roadmap

The following classical analytical solutions are not tested in the current suite and not mentioned as specific tests to add in any roadmap document. They are organized by impact.

### 5.1 Structural Invariants (verify solver correctness globally)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Maxwell reciprocal theorem | `delta_ij = delta_ji` | Stiffness matrix symmetry in practice | Maxwell (1864); Timoshenko & Goodier |
| Betti's theorem | `W_12 = W_21` (reciprocal work) | Energy consistency | Betti (1872) |

SOLVER_ROADMAP Step 5 mentions "stiffness matrix symmetry" as a property-based invariant test category, but not Maxwell/Betti specifically as tests to implement.

### 5.2 Stability (critical gaps)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Inelastic buckling (tangent modulus) | `Pcr = pi^2 * Et * I / L^2` where `Et = d_sigma/d_epsilon` | Columns of intermediate slenderness | Shanley (1947); Galambos & Surovek, Ch. 3 |
| Lateral-torsional buckling (analytical) | `Mcr = (pi/L) * sqrt(EIy * GJ) * sqrt(1 + (pi^2 * E * Cw) / (G * J * L^2))` | Verifies the formula used in steel_check.rs | Timoshenko & Gere, "Theory of Elastic Stability", Ch. 6 |
| Plate buckling (simply supported edges) | `sigma_cr = k * pi^2 * E / (12(1-nu^2)) * (t/b)^2` | Section classification in steel codes | Timoshenko & Gere, Ch. 9; AISC 360 Table B4.1b |
| Thermal buckling of restrained bar | `DeltaT_cr = pi^2 / (alpha * (L/r)^2)` | Thermal-structural coupling | Brush & Almroth, "Buckling of Bars, Plates, and Shells" |

The roadmap mentions Cook's membrane as a "done when" criterion for Step 9 (plasticity), but not as an element quality benchmark. Inelastic buckling, LTB analytical, plate buckling, and thermal buckling are not referenced.

### 5.3 Plates and Shells (missing fundamental cases)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Cook's membrane (as element quality test) | `u_y(C) = 23.96` at loaded corner | Element performance under severe distortion | Cook et al. (1989), "Concepts and Applications of FEA", 4th Ed. |
| Navier plate — moments (not just deflection) | `Mx = alpha_x * q * a^2`, tables in Timoshenko | Bending stress recovery accuracy | Timoshenko & Woinowsky-Krieger, Table 8 |
| Levy solution (2 SS + 2 other edges) | Trigonometric series | Mixed boundary conditions | Timoshenko & Woinowsky-Krieger, Ch. 6 |
| Circular plate, clamped, uniform load | `w = q(a^2 - r^2)^2 / (64D)` | Non-rectangular geometry | Timoshenko & Woinowsky-Krieger, Ch. 3 |
| Mindlin vs Kirchhoff plate comparison | Shear correction factor kappa = 5/6 | Thick plate behavior | Mindlin (1951); Hughes, "The Finite Element Method" |

### 5.4 Beams (missing fundamental cases)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Timoshenko beam shear correction | `delta_T = delta_EB * (1 + 12EI/(G*As*L^2))` | Short beam behavior (L/h < 5) | Timoshenko (1921); Cowper (1966) |
| Fixed-fixed beam, centered point load | `delta = PL^3 / (192EI)`, `M_end = PL/8` | Basic indeterminate case | Any structural analysis textbook |
| Hetenyi closed-form (beam on elastic foundation) | `y(x) = P*lambda/(2*ks*b) * exp(-lambda*x) * (cos(lambda*x) + sin(lambda*x))` | Winkler foundation — full curve shape | Hetenyi, "Beams on Elastic Foundation" (1946) |

### 5.5 Dynamics (missing fundamental cases)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| SDOF harmonic response at resonance | `DAF = 1/(2*xi)` at `omega = omega_n` | Frequency response function | Chopra, "Dynamics of Structures", Ch. 3 |
| SDOF impulse response | `u(t) = (I / (m*omega)) * sin(omega*t)` | Impulse-momentum theorem | Chopra, Ch. 4 |
| Fixed-fixed beam natural frequencies | `beta_1*L = 4.730`, `beta_2*L = 7.853`, `beta_3*L = 10.996` | Double-clamped boundary condition | Blevins, "Formulas for Natural Frequency and Mode Shape" |
| Rayleigh damping — full curve verification | `xi(omega) = alpha/(2*omega) + beta*omega/2` | Damping model accuracy across frequency range | Chopra, Ch. 11 |

Current tests verify Rayleigh damping at two target frequencies only (xi_1 = xi_n = 0.05), not the shape of the curve between and beyond them.

### 5.6 Nonlinear (missing collapse mechanisms)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Plastic collapse — propped cantilever | `P_collapse = 6*Mp / L` (2 hinges) | Second simplest collapse mechanism | Neal, "Plastic Methods of Structural Analysis" |
| Plastic collapse — portal frame combined mechanism | Kinematic theorem: minimize over beam/sway/combined | Multi-mechanism verification | Horne, "Plastic Theory of Structures" |
| Bimetallic strip curvature | `kappa = 6*(alpha1-alpha2)*DeltaT*(1+m)^2 / [h*(3(1+m)^2 + (1+mn)(m^2+1/mn))]` | Thermal gradient in composite sections | Timoshenko, "Analysis of Bi-Metal Thermostats" (1925) |

### 5.7 Shells (missing simple membrane case)

| Test | Formula | What it verifies | Reference |
|------|---------|-----------------|-----------|
| Cylindrical shell under internal pressure | `sigma_theta = pR/t`, `sigma_x = pR/(2t)` | Simplest membrane shell state | Timoshenko & Woinowsky-Krieger, Ch. 15 |
| Spherical shell under internal pressure | `sigma = pR/(2t)` | Biaxial membrane | Timoshenko & Woinowsky-Krieger, Ch. 14 |

While some shell pressure tests may exist in the broader validation domain files, they are not cataloged as analytical verification tests and are not mentioned in the roadmap's verification strategy.

## 6. Analysis Method Selection

### 6.1 No Automatic Analysis Type Recommendation

The product roadmap mentions "Analysis type choice" as a medium-impact automation item and "AI setup guidance — suggest shell family, analysis path" in Product Step 1. However, the solver roadmap does not specify any rule-based analysis advisor as a work item.

A rule-based advisor (not AI-dependent) would provide immediate value:

| Rule | Trigger | Action |
|------|---------|--------|
| Second-order effects significant | Any compression member with N/Ncr > 0.1 | Warning: "Consider P-Delta analysis" |
| Structure near instability | Any compression member with N/Ncr > 0.3 | Warning: "Linear results may be significantly unconservative" |
| Cable/tension structure | Model contains cable elements or large-displacement truss | Recommend corotational analysis |
| Seismic with insufficient modes | Spectral analysis with cumulative mass participation < 90% | Warning: "Add more modes" |

This does not require AI infrastructure and could be implemented as a post-linear-solve diagnostic.

### 6.2 Shell Family Selection Already Exists

`shell-family-selector.ts` chooses MITC4/MITC9/SHB8-ANS/curved shell based on geometry metrics (aspect ratio, warp angle, thickness ratio). This is a good model for what should exist for analysis type selection.

## 7. Convergence Assurance

### 7.1 Summary of Convergence Controls

| Solver | Convergence criterion | Adaptive stepping | Line search | Divergence detection | State restoration |
|--------|----------------------|-------------------|-------------|---------------------|------------------|
| P-Delta | Displacement only | No (single step) | No | No | No |
| Corotational | Force residual | No (fixed inc/N) | No | No | No |
| Material NL | Force residual | No (fixed inc/N) | No | No | No |
| Fiber NL | Force residual | No (fixed inc/N) | No | No | No |
| Arc-length | Force residual | **Yes** (inline) | No | **Yes** (step halving) | **Yes** |
| Cable | Tension change | No | No | No | No |

Arc-length is the only robust solver. The other five lack at least three of the four robustness mechanisms (adaptive stepping, line search, divergence detection, state restoration). The code for adaptive stepping and line search already exists in the codebase.

### 7.2 Post-Solve Verification

No solver currently verifies its own solution. A residual check `||K*u - f|| / ||f|| < tolerance` after solving would catch:
- Cholesky/LU factorization errors from ill-conditioning
- NaN propagation from degenerate input
- Regularization artifacts from sparse pivot perturbation
- Dense fallback producing different results from sparse

This check costs one matrix-vector multiply (negligible compared to factorization) and would be the single highest-value safety mechanism.

## 8. Test Infrastructure Issues

These were partially addressed by recent commits (bca5676, 4e91ddc, 625dfe9) but some gaps remain.

### 8.1 Random Fuzz Tests With Skip Markers

70 of 100 random fixture files now have `random-*-skip.json` markers with `{"reason": "mechanism or solver error"}`. The `random_parity_test!` macro handles these with a silent `return`:

```rust
if fixture_exists(&skip_name) {
    return;  // test passes without any assertion
}
```

This is better than before (the skips are intentional) but cargo test still reports these as PASS, not IGNORED. Using `#[ignore]` or `panic!("skipped: {reason}")` would make the test report more honest.

### 8.2 Tolerance Tiers

The current test suite uses the same `assert_close` function with tolerances ranging from 0.001 to 0.30 across all test types. The safety hardening research note correctly identifies that analytical tests, parity tests, and benchmark comparisons should have different tolerance expectations. However, the roadmap does not specify concrete tolerance tiers.

Suggested tiers:
- Analytical/closed-form solutions: rel_tol = 0.001 (0.1%)
- Internal regression tests (Rust vs fixtures): rel_tol = 1e-10 (machine precision)
- External benchmark comparison (NAFEMS, ANSYS VM): rel_tol = 0.02-0.05 (2-5%)
- Shell convergence studies: document convergence rate, not just final value

## 9. Solution Initialization and Warm-Start

### 9.1 All Solvers Initialize From Zero Displacement

Every solver in the codebase initializes the displacement vector as `let mut u_full = vec![0.0; n]`. This applies uniformly across all analysis types:

| Solver | File | Line(s) |
|--------|------|---------|
| Linear 2D/3D | `linear.rs` | 116, 337, 428, 536 |
| Corotational 2D/3D | `corotational.rs` | 38, 859 |
| Material Nonlinear 2D/3D | `material_nonlinear.rs` | 107, 842 |
| Fiber Nonlinear 2D/3D | `fiber_nonlinear.rs` | 110, 572 |
| Arc-Length / Displacement Control | `arc_length.rs` | 138, 362 |
| P-Delta | `pdelta.rs` | (uses linear solve, inherits zero init) |
| Cable 2D/3D | `cable.rs` | 186, 440 |
| SSI 2D/3D | `ssi.rs` | 121, 266 |
| Contact 2D/3D | `contact.rs` | 315, 943 |
| Time Integration 2D/3D | `time_integration.rs` | 83-85 (u, v, a all zero), 832-834 |
| Spectral 2D/3D | `spectral.rs` | 97, 322 |
| Reduction (Guyan/CB) | `reduction.rs` | 276, 724 |
| Staged 2D | `staged.rs` | (uses per-stage linear solve) |
| Winkler 2D/3D | `winkler.rs` | 126, 234 |
| Buckling 3D | `buckling.rs` | 242, 275 |

For linear analysis this is correct (the system is solved exactly). For nonlinear analysis, zero is a reasonable starting point when combined with incremental loading. However, there is no mechanism to override this default.

### 9.2 Dead `initial_displacements` Field

`ImperfectionInput` in `types/input.rs:878` defines:

```rust
/// Initial displacements from previous analysis (node_id → [ux, uy, rz])
pub initial_displacements: HashMap<String, Vec<f64>>,
```

This field is **never read by any solver**. The WASM entry points `solve_with_imperfections_2d` and `solve_with_imperfections_3d` (`lib.rs:908-959`) apply geometric imperfections and notional loads, but ignore `initial_displacements` entirely. A user passing initial displacements via the API would get no effect and no error.

**Impact:** This is dead API surface that promises a capability the solver does not deliver. Either wire it (apply as initial displacement vector before solving) or remove it to avoid confusion.

### 9.3 No Warm-Start or Continuation Capability

None of the nonlinear solver APIs accept an initial displacement estimate:

```rust
solve_corotational_2d(input, max_iter, tolerance, n_increments, modified_nr)
solve_nonlinear_material_2d(input: &NonlinearMaterialInput)
solve_fiber_nonlinear_2d(input: &FiberNonlinearInput)
solve_arc_length(input: &ArcLengthInput)
solve_displacement_control(input: &DisplacementControlInput)
```

This prevents several engineering workflows:

| Workflow | Why it needs warm-start | Workaround available? |
|----------|------------------------|----------------------|
| Multi-phase construction | Stage N should start from Stage N-1 deformed state | Staged solver handles this internally, but users cannot chain arbitrary analysis types |
| Post-earthquake residual analysis | Start nonlinear static from dynamic final state | No |
| Load sequence change | Continue from a converged state with modified loads | Must re-run from zero |
| Parameter study continuation | Nearby parameter → nearby solution → fewer iterations | No |
| Pre-stressed concrete (after losses) | Start nonlinear with initial stress/strain state | Fiber nonlinear can use residual stresses via imperfections, but not initial displacements |

**Not mentioned in:** SOLVER_ROADMAP.md, PRODUCT_ROADMAP.md, or numerical_methods_gap_analysis.md.

### 9.4 Time Integration Initial Conditions

Time integration (`time_integration.rs:82-91`) initializes u, v, a all to zero, then computes initial acceleration from `M*a0 = F0 - C*v0 - K*u0`. This is correct for zero initial conditions but there is no API field to specify non-zero initial velocity or displacement (e.g., for vibration from an initial displaced shape, or free-vibration decay from a static deformed configuration).

## 10. Preconditioning and Iterative Solver Infrastructure

### 10.1 Current Linear Solver Strategy: Direct Only

The codebase uses direct solvers exclusively:

| Solver | File | Use case |
|--------|------|----------|
| Sparse Cholesky | `linalg/sparse_chol.rs` | Primary path for all 3D problems. Left-looking symbolic factorization, AMD/RCM ordering, two-tier pivot perturbation |
| Dense Cholesky | `linalg/cholesky.rs` | Small-medium 2D problems, SPD systems |
| Dense LU | `linalg/lu.rs` | Fallback for non-SPD or when Cholesky fails |

This strategy is correct for current model sizes. The sparse Cholesky is healthy (1.8× fill on shell meshes via RCM, 22-89× factorization speedup over dense).

### 10.2 No Iterative Solvers

No Krylov iterative solvers exist in the codebase:

- No Preconditioned Conjugate Gradient (PCG)
- No GMRES / MINRES / BiCGSTAB / LSMR
- No iterative solver abstraction or trait

**Note:** `linalg/jacobi.rs` implements the cyclic Jacobi **eigenvalue** solver (for dense symmetric eigenvalue problems), not Jacobi preconditioning. The name is a potential source of confusion.

### 10.3 No Preconditioner Infrastructure

No preconditioners of any kind:

- No diagonal / Jacobi preconditioning
- No Incomplete Cholesky IC(0)
- No SSOR / SOR
- No Algebraic Multigrid (AMG)
- No preconditioner trait or abstraction

### 10.4 Existing Iterative Refinement (Limited Scope)

The 3D sparse linear solver path (`linear.rs:369-390`) has iterative refinement, but only as a post-correction for pivot perturbation artifacts:

```rust
// Iterative refinement against the ORIGINAL K_ff to correct for
// the regularization shift. Up to 5 steps of residual correction.
if pivot_perturbations > 0 {
    for _ in 0..5 {
        // r = f - K*u, then solve K*du = r, u += du
    }
}
```

This is good practice for regularized systems but is not a general iterative solver — it still depends on a direct factorization and only activates when pivot perturbation was needed.

### 10.5 Conditioning Diagnostics Are Informational Only

`conditioning.rs` computes the diagonal ratio of the stiffness matrix and logs warnings at thresholds (1e8, 1e12). The solver continues regardless. There is no mechanism to:

- Select solver/preconditioner based on conditioning
- Trigger iterative refinement for poorly conditioned systems
- Reject results when conditioning makes them meaningless

### 10.6 Roadmap Position

From `numerical_methods_gap_analysis.md`, iterative solver infrastructure is **P2 priority**, after P1 (deeper sparse eigensolver integration):

1. P2.1: General iterative refinement (low effort, quality backstop)
2. P2.2: PCG with diagonal/Jacobi preconditioning
3. P2.3: IC(0), SSOR, eventually AMG

This ordering is reasonable. For models up to ~50k DOFs, the sparse direct solver is likely faster than an iterative solver with simple preconditioning. Iterative solvers become advantageous at larger scales (>100k DOFs) or for problems where the stiffness matrix changes frequently (nonlinear, contact) and refactorization is expensive.

### 10.7 Impact on Nonlinear Convergence

The absence of iterative solvers has indirect effects on nonlinear convergence:

- **Modified Newton-Raphson** caches a single Cholesky factorization and reuses it. This is effectively using the initial tangent as a "preconditioner" for the Newton system. An actual preconditioned Krylov solver with the initial tangent as preconditioner would be mathematically equivalent but could adapt more smoothly.
- **Quasi-Newton methods** (BFGS, L-BFGS, Broyden — P3 priority) approximate the tangent update without refactorization. These are currently not implemented and would provide the most direct benefit to nonlinear solve cost.
- **Contact and SSI problems** involve status-changing stiffness that can cause convergence difficulties. Broyden-type updates are particularly suited to these problems but are not yet available.

## 11. Prioritized Recommendations

### Immediate (days of work, high safety impact)

1. Wire `AdaptiveStepper` into corotational, material_nonlinear, fiber_nonlinear — the code exists and is tested
2. Add post-solve residual check `||K*u - f|| / ||f||` — one mat-vec multiply, catches all factorization failures
3. Add NaN/Inf check on displacement vector before post-processing
4. Auto-execute `section_stress.rs` scan after linear solve, include overstress warnings in results
5. Compute N/Ncr for compression members post-linear-solve, warn if > 0.1
6. Resolve dead `initial_displacements` field — either wire it into the imperfection solve path or remove it from `ImperfectionInput`

### Near-term (weeks of work, trust impact)

7. Wire `line_search.rs` into N-R loops (corotational, material_NL, fiber_NL)
8. Add force-based convergence check to P-Delta
9. Add divergence detection to all nonlinear solvers
10. Add shear check to `steel_check.rs` (AISC G2)
11. Standardize pass/fail boolean across all design check modules
12. Add self-weight auto-computation for frame elements from section properties and material density
13. Add `initial_u` parameter to nonlinear solver APIs for warm-start / continuation analysis
14. Add non-zero initial conditions (u0, v0) to time integration API

### Scalability (P2 roadmap, months of work)

15. General iterative refinement as quality backstop for all direct solves (not just pivot-perturbed)
16. PCG with diagonal/Jacobi preconditioning for large SPD systems
17. Preconditioner infrastructure: IC(0), SSOR, trait abstraction
18. Conditioning-aware solver selection (direct for well-conditioned, iterative + preconditioner for large/ill-conditioned)

### Nonlinear cost reduction (P3 roadmap)

19. Quasi-Newton variants (BFGS, L-BFGS) for nonlinear solvers where full tangent refactorization dominates cost
20. Broyden updates for contact/SSI status-changing problems

### Verification depth (ongoing, credibility impact)

21. Add Maxwell/Betti reciprocity test
22. Add LTB analytical verification
23. Add inelastic buckling test
24. Add Cook's membrane as element distortion benchmark
25. Add circular plate, Levy solution, Mindlin thick plate tests
26. Add SDOF harmonic resonance, fixed-fixed beam frequencies, impulse response
27. Add propped cantilever plastic collapse
28. Add Hetenyi closed-form verification for beam on elastic foundation
29. Add cylindrical/spherical shell membrane pressure tests
