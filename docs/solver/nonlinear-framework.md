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
| Sparse LDLᵀ, no pivoting, up-looking (Davis's LDL) | symmetric tangents, definite or indefinite | the inertia: the number of negative eigenvalues |
| Sparse LU, threshold partial pivoting (Gilbert–Peierls, `cs_lu`) | nonsymmetric tangents (3D co-rotational away from equilibrium); LDLᵀ meeting a tiny pivot | the determinant's sign |
| Bordered system [K −F; e_cᵀ 0], by LU | displacement control where K itself is singular (a perfectly plastic mechanism) | δu and δλ together |

Measured on grids, release build:

| Grid | Unknowns | LDLᵀ | LU |
|---|---|---|---|
| 2D 141² | 20k | 19 ms | 61 ms |
| 3D 20³ | 8k | 90 ms | 0.44 s |
| 3D 28²×26 | 20k | 0.84 s | 4.3 s |

LU is about 5× LDLᵀ on 3D fill, so it stays a fallback. A 1,296-DOF space frame solves in the
test suite in under a second in debug.

## The robust default

Every strategy applies the same policy, cheapest first and escalating only on failure:

1. **Newton–Raphson** with the consistent tangent, factored by LDLᵀ.
2. **Line search** (Crisfield's, on du·R). It is not used on every iteration: early in a
   large-rotation step, Newton's residual energy often rises before it converges quadratically,
   and a line search there slows it (40× on the end-moment test). It runs only when plain Newton
   fails a load step, on a retry of the same step.
3. **Step cutting.** The step is halved, then grows back after successes. There is a floor of
   10⁻⁸ of the nominal step, so a step that keeps failing and growing back cannot loop forever.
4. **Arc-length past limit points.** `Strategy::Auto` runs load control, and continues by
   arc-length from the last converged state when load control meets a limit point or stops
   converging. When the arc passes the target load, a final load step lands on it exactly.
5. **Linear-solver fallbacks:**
   - LDLᵀ, then LU when the tangent is nonsymmetric or a pivot is tiny;
   - for displacement control, the bordered system when K is singular;
   - one step of iterative refinement on every solve.

**Detecting where a strategy cannot go.** Load control stops with `LimitPoint`, never with a
silent jump to a distant branch, when:
- the tangent's inertia (or determinant sign) changes during a step;
- the converged step lands outside ¼–4 times the tangent's prediction;
- Bergan's stiffness parameter drops below 10⁻³.

Displacement control stops with `LimitPoint` at a snap-back, by the same prediction check.
Arc-length follows both snap-through and snap-back.

**Convergence test.** Converged when ‖R‖ ≤ tol·max(|λ|·‖F‖, ‖f_int‖), or when ‖R‖ reaches the
rounding floor ε·‖K‖·‖u‖.

**Failure contract.** The outcome is always the last converged state, with why the analysis
stopped. `Err` is only for an invalid request.

### Planned rungs

- **Modified Newton and BFGS,** as a cheaper first rung for large models: the tangent is
  refactored only when convergence slows.
- **Regularization for softening materials** (concrete cracking): IMPL-EX, viscous
  regularization, and crack-band scaling at the material.
- **Weighted norms.** An energy-norm test, and per-DOF-type scaling of the force and arc norms,
  replacing today's unscaled mix of forces and moments.
- **Bifurcation handling.** Branch switching at a bifurcation, using the eigenvector of the zero
  pivot as an imperfection; today the inertia only reports it.
- **Supernodal LDLᵀ** for large 3D models, along the lines of the engine's supernodal Cholesky.
  Multithreaded assembly where it is available (not in WASM).
- **Spherical arc-length,** with a ψ weight on the load, as an option.

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
- **The limit-point checks are heuristics** (the ¼–4 band, the 10⁻³ stiffness parameter),
  validated on the tests above and on nothing else yet.
- **LU and inertia.** When LU is used, the inertia is not known: the 3D co-rotational tangent is
  nonsymmetric away from equilibrium. There, the determinant's sign stands in for it.
- **Displacement-based fiber elements** need several elements per member.
- **Not wired to WASM or the app.**

## Next

1. **Layered shell.** A layered section integrating `PlaneStressMaterial` through the thickness,
   and a flat shell element (MITC4) with linear and co-rotational kinematics. With `PlaneStressJ2`
   this gives EN 1993-1-5 Annex C / EN 1993-1-14 plate analysis, and GMNIA with imperfections
   shaped like the buckling modes.
2. **The planned rungs above,** starting with modified Newton and the weighted norms.
3. **Cracked-slab deflection** as a secant concrete-with-rebar layer law on the same shell.
4. **A WASM entry point and the failure contract in the app,** behind `feature_gates`.
