# A general nonlinear framework (draft)

Status: **draft**. The code lives in `engine/src/nonlinear/`, and the tests in
`engine/tests/nonlinear_framework.rs` (2D), `nonlinear_framework_3d.rs` (3D) and
`nonlinear_sparse.rs` (the factorizations). The app does not call it, and it changes no existing
solver.

## Why

Each nonlinear analysis in the engine is its own solver, with its own Newton loop, convergence
test and failure report: P-Delta, co-rotational, arc-length, material nonlinear, fiber, contact,
cable, plastic, staged, SSI ([nonlinear.md](nonlinear.md)). Adding a nonlinear shell or solid
material that way would mean one more loop per material and per element. This framework is for
what comes next: a material, element, kinematics or solution strategy written once works with all
the others.

The existing solvers stay as they are. They are the oracles the framework is tested against.

## Layers

| Layer | Trait | Implemented |
|---|---|---|
| Material | `UniaxialMaterial`, `PlaneStressMaterial` | `Elastic1D`; `FiberLaw1D` (the fiber solver's laws, called as they are); `PlaneStressElastic`; `PlaneStressJ2` |
| Section | `FiberSection2D`, `FiberSection3D` | fibers; rectangle helpers; 3D with biaxial bending (torsion is the element's) |
| Element | `Element` (2D), `Element3D` | `Frame2D`, `Truss2D`, `Frame3D`, `Truss3D`; basic responses elastic or fiber, 2D and 3D |
| Kinematics | `Kinematics` | `Linear` (small displacements) or `Corotational` (large displacements and rotations, small strains) |
| Model | `NonlinearModel` | `Model2D` (additive updates); `Model3D` (rotation matrices per node, updated multiplicatively) |
| Linear solver | `TangentSystem` | sparse LDLᵀ, sparse LU, the bordered system; one fixed policy (below) |
| Driver | `solve` | load control, displacement control, arc-length, Auto |

The state contract is the same at every layer. `update` / `set_trial_strain` compute a trial
state from the last committed one. The driver commits a converged step and reverts a failed one.
An iteration that does not converge never writes path-dependent state.

### 3D finite rotations

`Model3D` keeps each node's rotation as a matrix R, and updates it as R ← exp(δθ)·R with δθ a
spatial increment. Large rotations do not add as vectors. Element tangents are written with
respect to those spatial increments.

The co-rotational frame is Battini & Pacoste's (CMAME 2002):

- **Element frame.** e₁ lies along the chord. e₂ and e₃ come from the mean of the nodes' rotated
  local y axes.
- **Local rotations.** R̄ᵢ = R_rᵀ·Rᵢ·R₀ and θ̄ᵢ = log R̄ᵢ, mapped to spins through the inverse
  tangent operator T_s⁻¹.
- **Internal force.** The deformation matrix B is analytic, including the frame's twist from the
  nodal rotations, so the internal force Bᵀ·q is exact.
- **Tangent.** It is Bᵀ·k_b·B plus the derivative of Bᵀ·q at frozen q. The derivative is taken
  by central differences of B alone, a few hundred flops per element with no material evaluated.
  The tests check the whole tangent against finite differences of the internal force.

## Linear solvers

The tangent system lives on the free DOFs. Its sparsity pattern comes from the elements' DOFs
once. Each element's slots in the matrix are computed once too, so assembly is a scatter. The
symbolic analysis (AMD ordering, elimination tree, the structure of L) is reused for every
factorization of the analysis.

| Factorization | For | Gives |
|---|---|---|
| Sparse LDLᵀ, no pivoting: supernodal, left-looking, with relaxed supernodes and a postordered AMD (simplicial up-looking below 32 unknowns) | symmetric tangents, definite or indefinite | the inertia: the number of negative eigenvalues |
| Sparse LU, threshold partial pivoting (Gilbert–Peierls, `cs_lu`) | nonsymmetric tangents (3D co-rotational away from equilibrium); LDLᵀ meeting a tiny pivot | the determinant's sign |
| Bordered system [K −F; e_cᵀ 0], by LU | displacement control where K itself is singular (a perfectly plastic mechanism) | δu and δλ together |

Measured on Laplacian grids, release build, numeric factorization. The machine was loaded, so
the times are approximate.

| Grid | Unknowns | LDLᵀ supernodal | LDLᵀ simplicial | LU |
|---|---|---|---|---|
| 3D 20³ | 8k | 31–34 ms | 93–100 ms | 0.44 s |
| 3D 28²×26 | 20k (nnz(L) = 4.2M) | 0.28–0.31 s | 0.88–0.94 s | 4.3 s |

LU is a fallback, about 15× the supernodal LDLᵀ on 3D fill.

**Supervariables.** The ordering compresses supervariables (DOFs with identical structure: the 3
or 6 of a node) and runs the engine's AMD on the quotient graph. The AMD itself is unchanged, and
each group's members stay consecutive.

On FE-like matrices of about 20k DOFs, fill and flops come out equal to plain AMD, and the
ordering runs 3–14× faster (AMD alone: 190 → 36 ms on a 27-node solid pattern, 70 → 5 ms on a
frame pattern).

The supernodes do not get wider: on FE matrices they already span a node or more, with a mean
width of 19.6 on the solid pattern and 10.4 on the frame. The AMD's mass elimination keeps a
node's DOFs together, and the narrow supernodes measured earlier came from scalar Laplacians,
which have no supervariables.

More relaxed amalgamation (2–4× CHOLMOD's defaults) gains within noise. The numeric kernel
already runs at about 9–11 GFlop/s, so the factorization is close to what a single thread without
SIMD gives. A 1,296-DOF space frame solves in the test suite in under a second in debug.

## The robust default

Every strategy applies the same policy, cheapest first and escalating only on failure:

0. **The previous step, extrapolated** (`extrapolate`, on by default). A load step starts from
   the last one scaled by Δλ/Δλ_prev instead of from the committed state. Any failure of an
   extrapolated attempt retries the step from the committed state, since its guess may have
   crossed something the committed state would not. On the elastica it saves Newton iterations
   to the same answer.
1. **The configured iteration.** `NewtonOptions::iteration` selects one of:
   - `Full` Newton–Raphson, the default;
   - `Modified` Newton, which refactors every k iterations;
   - `Bfgs`, limited-memory Matthies–Strang with the step's first factorization as H₀.

   The last two cost fewer factorizations on large, mildly nonlinear models. If either fails, the
   same step is retried with full Newton.
2. **Line search** (Crisfield's, on du·R). It runs only when full Newton fails a load step, on a
   retry of the same step. Running it on every iteration made the end-moment test 40× slower,
   because early in a large-rotation step Newton's residual energy often rises before it
   converges quadratically.
3. **Step control by iteration count.**
   - A failed step is cut to a quarter.
   - Two steps in a row that converge in at most 4 iterations grow the next by 1.5×.
   - A step that needs more than 8 shrinks the next by 0.75×, but never below 1/16 of the
     nominal step. Steps shrinking geometrically on success would add up to less than the
     distance left, and the analysis would never arrive; this happened at a plastic plateau.
   - Steps never cross the strategy's nominal points (λ, or the control displacement, at each
     increment), so those are always results.
   - Cuts have a floor of 10⁻⁸ of the nominal step, and the whole analysis can be given a Newton
     iteration budget (`max_total_iterations`, failed attempts included). It stops with
     `IterationBudget`.
4. **Arc-length past critical points.** `Strategy::Auto` runs load control, and continues by
   arc-length from the last converged state when load control meets a limit or bifurcation point
   (as a change of stability, a failure to converge, or a singular tangent). When the arc passes
   the target load, a final load step lands on it exactly.
5. **Critical points and branch switching.** When arc-length gains m negative eigenvalues, the
   driver handles the crossing in five steps:
   - **Locate.** The crossing step is cut back until it is a 256th of the step that found it.
   - **Critical subspace.** A block inverse iteration with m + 1 vectors on the tangent's
     factorization, then Rayleigh–Ritz on the symmetric part, gives the m Ritz vectors nearest
     zero.
   - **Classify** by the subspace's alignment with the load, ‖Φᵀ·F‖/‖F‖:
     - **bifurcation** of multiplicity m when it is below 10⁻²;
     - **limit point** when m = 1 and it is above;
     - **bifurcation at a limit point** when m ≥ 2 and it is above. The part of the subspace
       orthogonal to the load holds the m − 1 bifurcation modes.

     The stiffness in the load direction cannot tell a limit point from a bifurcation: a soft
     support in series keeps it positive past a limit point.
   - **Record.** Each point goes into `Outcome::critical_points` with its λ, kind, multiplicity,
     load alignment, modes over all DOFs (most unstable first, normalized on translations) and
     Rayleigh quotients.
   - **Switch.** At a bifurcation the next step leaves along mode `branch_mode` (default 0, the
     most unstable), in the direction `branch_reverse` selects, at constant load, with an arc of
     at least 10⁻³ of the model's length. At an asymmetric bifurcation the two directions lead
     to different branches, one rising and stable, the other falling and unstable.
6. **Linear algebra.**
   - Symmetric equilibration S·K·S, S = diag(1/√|K_ii|), on every factorization. This makes the
     pivot tests independent of units and of a wide spread of stiffnesses (the buckled column of
     the tests has EA·L²/EI = 10⁸). It is a congruence, so the inertia is K's.
   - LDLᵀ first, then LU when the tangent is nonsymmetric or a pivot is tiny. For displacement
     control, the bordered system when K is singular.
   - **Stability of a slightly nonsymmetric tangent.** The 3D co-rotational tangent is slightly
     nonsymmetric away from equilibrium, which is a by-product of the rotation parametrization:
     its asymmetry vanishes at equilibrium under conservative loads. LU factors it, and the
     inertia at converged states comes from the symmetric part, when the relative asymmetry is
     at most 10⁻⁶.
   - One step of iterative refinement on every solve.

**Detecting where a strategy cannot go.** Load control stops with `LimitPoint`, never with a
silent jump to a distant branch, when any of these happens during a step:
- the inertia changes;
- the symmetric tangent becomes too nearly singular for LDLᵀ;
- the converged step lands outside ¼–4 times the tangent's prediction;
- Bergan's stiffness parameter drops below 10⁻³.

Displacement control stops at a snap-back: with `LimitPoint` if Newton lands on the far branch (the prediction check), or with `NoConvergence` if the divergence check catches it heading there.
Arc-length follows snap-through and snap-back. It is cylindrical by default, or spherical with
`arc_psi`. Its arc grows by at most 32× the first arc, or 10% of the model's length if that is
larger.

**Convergence test.** Three criteria, all required, each evaluated on the correction Newton would
add next. That correction is computed anyway, so the test costs one more solve per step:
- **Force.** The residual is measured separately on forces and on moments, each against its own
  scale: the largest applied load, internal force or reaction of that kind seen so far in the
  analysis (default tolerance 10⁻⁹). A model that carries no moment takes the moment scale from
  the force scale through `rotation_length`, by default the model's bounding-box diagonal.
- **Displacement.** The next correction is at most 10⁻⁶ of the step's increment, again
  separately for translations and rotations (`displacement_tolerance`). Below 64·ε of the total
  displacement the correction cannot be resolved, so it passes there: a step cut very short has
  corrections at the round-off of the displacement, not of the step.
- **Energy.** |δu·R| ≤ 10⁻¹² of the step's first (`energy_tolerance`), consistent in units by
  construction.

At the rounding floor ε·‖K‖·‖u‖ the force and energy criteria pass: no criterion can ask for
more. In a test with a force tolerance loosened to 10⁻³, the displacement criterion alone holds
the answer to 10⁻⁹.

**Divergence.** A step is cut as soon as its residual has grown in two consecutive iterations
and is above where the step started (`divergence_check`). Growth alone is not enough: near
convergence, and when fibers change state, the residual wobbles far below its start.

**Failure contract.** The outcome is always the last converged state, with why the analysis
stopped. It also reports the number of factorizations, the Newton iterations including failed
attempts, and the critical points. `Err` is only for an invalid request.

**Checks for every element and material** (`nonlinear::check`, applied in
`tests/nonlinear_checks.rs`):
- the tangent against central differences of the internal force or stress (3D with spatial
  rotation increments);
- symmetry where the formulation is symmetric;
- objectivity: a rigid motion strains nothing, and a rigidly rotated state has the rotated
  internal force, moments included.

A new element or material is expected to go through the same functions. The check caught a sign
error in the first kinematic-hardening tangent.

**Plane-stress J2.**
- **Isotropic hardening:** linear or tabulated (`Hardening::Table`, flat past the last point).
- **Kinematic hardening:** linear, Prager's.
- **Return mapping:** Newton on Δγ inside a bisection bracket, robust to a 1000·ε_y increment
  and to the kinks of a table.
- **Softening:** a slope with 3G + H ≤ 0 has no unique return and is refused.
- **Tangent:** the consistent tangent is derived for combined hardening.

### Still planned

- **Regularization for softening materials** (concrete cracking): IMPL-EX, viscous
  regularization, and crack-band scaling at the material. This waits for a softening
  plane-stress law; the uniaxial Hognestad concrete's descending branch is the only softening
  so far.
- **Oscillating divergence.** The divergence check sees monotone growth (two growths in a
  row), as fieldcraft's does. Newton oscillating outward (atan-like responses) alternates small
  and large residuals and runs to the iteration limit before the step is cut.
- **3D linear kinematics.** It takes log R as the rotation, while the driver updates rotations
  multiplicatively. The two agree to O(θ²), which is inherent in small-displacement kinematics.
- **Continuous symmetry.** A doubly symmetric column has a neutral mode on its buckled branch:
  the plane of buckling can turn. Its two modes are found, but following a branch there needs a
  constraint on that symmetry.
- **Branch switching under displacement control,** which today passes a bifurcation on the
  primary path.
- **Multithreaded assembly** where it is available (not in WASM).

## Validation

| Test | Checks against |
|---|---|
| 2D elastic frame, linear kinematics | `solver::linear::solve_2d`, to 1e-9 |
| 2D elastic cantilever, PL²/EI = 5, co-rotational | `solver::corotational::solve_corotational_2d`, to 1e-6 |
| End moment rolls a cantilever into ¾ of a circle (2D and 3D) | closed form |
| Tip load, PL²/EI = 1, 2, 5, 10 | Mattiasson's elastica, to 1e-3·L |
| The elastica at PL²/EI = 10 requested as one load step | Mattiasson's elastica (the driver cuts on its own) |
| Two-bar truss snap-through, displacement control | closed form along the whole path |
| Load control past the limit point (7, 15, 16, 23 increments) | stops with `LimitPoint` on the near branch |
| Auto past the same limit point | arc-length takes over and reaches 1.5·P_max on the far branch, every step on the closed form |
| Snap-back (truss loaded through a soft spring) | arc-length on the closed form throughout, ending on the target load; displacement control stops with `LimitPoint` |
| LDLᵀ inertia along the snap-through | one negative eigenvalue exactly where dP/dw < 0 |
| Perfect cantilever column, Auto to 1.1·P_cr | branch switch within 0.2 % of π²EI/4L²; Euler's elastica (elliptic integrals): sideways tip deflection to 1 %, drop to 2 %; the buckled branch stable. Without switching: straight and unstable |
| Two identical independent columns | multiplicity 2 within 1 % of P_cr; each column ends straight or on the elastica |
| Roorda's frame (nearly inextensible) | P_cr from `solver::buckling::solve_buckling_2d` (1.407·π²EI/L²) within 2 %; the two mode directions give opposite load slopes, the falling branch unstable and the rising one stable |
| Snap-back crossings | classified as limit points (load alignment > 0.1) |
| Square 3D column | two independent lateral modes orthogonal to the load, within 1 % of P_cr; stability through LU and the symmetric part |
| Every element (2D/3D frames and trusses, elastic and fiber, linear and co-rotational) and material (uniaxial laws; J2 with each hardening, fresh and after history) | `nonlinear::check`: tangents against central differences; symmetry; objectivity under rigid motion |
| J2: kinematic hardening; table; huge increment; steep softening | re-yield at τ_max − 2τ_y (Bauschinger); σ_eq on the table; a 1000·ε_y step converges; refused |
| Loose force tolerance (10⁻³) with the displacement criterion | the answer of the tight one to 10⁻⁹; without it, at least 10× further off |
| Iteration budget | stops with `IterationBudget` on the last converged state |
| A material with a wrong-sign tangent | the divergence check cuts each attempt after two growths, at a fifth of the iterations or less |
| Elastica in 40 steps, extrapolated vs not | the same answer to 10⁻⁸ with fewer Newton iterations |
| Modified Newton and BFGS on the plastic cantilever | the same displacement as full Newton to 1e-6, with fewer factorizations |
| Energy criterion; moment scaling of 10⁻³ and 10³ | the same converged path to 1e-7 |
| Spherical arc-length (ψ = 10⁻³) through the snap-back | the closed form |
| Plastic cantilever, small displacements | 3EI/L³; the collapse load converges to Mp/L from above at first order |
| Plastic cantilever, large displacements | M_support = P·(L + uₓ) on the deformed shape |
| 3D space frame, loads in all six directions | `solver::linear::solve_3d`, to 1e-9 |
| 3D co-rotational cantilever, biaxial load | `solver::corotational::solve_corotational_3d`, to 1e-4 |
| Torque twisting a bar to 270° | rotation matrices, exact |
| Bathe–Bolourchi 45° bend, P = 300, 450, 600 | Simo & Vu-Quoc (1986), within 0.5 on a radius of 100 |
| 3D fiber cantilever bent in a plane | the 2D fiber cantilever, step for step, to 1e-8 |
| Element tangents (2D, 3D; elastic and yielded; large rotation) | central differences |
| 1,296-DOF space frame, co-rotational, small load | the linear solution, to 1e-3; stable inertia |
| Plane-stress J2 | yield in equal biaxial tension and in pure shear; return onto the hardened surface; consistent tangent; unloading |
| Sparse LDLᵀ and LU | dense LU; eigenvalue counts; determinant signs; bit-identical repeats |

## Limitations

- **Loads.** Nodal only: no element loads, self-weight or thermal loads. Nodal moments in 3D are
  about fixed global axes.
- **Perfectly plastic plateaus.** With zero hardening, and a stiffness range spanning many
  orders (a torsion stiffness far above a plastic plateau's), the bordered system's pivot test
  can refuse the mechanism and stop with `SingularTangent`. A small hardening avoids it.
- **The critical-point checks are heuristics:** the ¼–4 band, the 10⁻³ stiffness parameter, the
  10⁻² load alignment and the 1/256 localisation. They are validated on the tests above, and on
  nothing else yet.
- **LU and inertia.** Within a load step, LU gives only the determinant's sign. At converged
  states, the inertia of a nearly symmetric tangent comes from its symmetric part; a tangent
  further from symmetric has none.
- **Displacement-based fiber elements** need several elements per member.
- **Not wired to WASM or the app.**

## Next

1. **Layered shell.** A layered section integrating `PlaneStressMaterial` through the thickness,
   and a flat shell element (MITC4) with linear and co-rotational kinematics. With `PlaneStressJ2`
   this gives EN 1993-1-5 Annex C / EN 1993-1-14 plate analysis, and GMNIA with imperfections
   shaped like the buckling modes.
2. **The rungs still planned above,** starting with softening regularization once a softening
   plane-stress law exists.
3. **Cracked-slab deflection** as a secant concrete-with-rebar layer law on the same shell.
4. **A WASM entry point and the failure contract in the app,** behind `feature_gates`.
