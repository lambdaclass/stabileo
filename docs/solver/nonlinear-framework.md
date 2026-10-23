# A general nonlinear framework (draft)

Status: **draft**. The code is in `engine/src/nonlinear/` and tested in
`engine/tests/nonlinear_framework.rs`. Nothing in the app calls it, and it changes no existing
solver.

## Why

Each nonlinear analysis in the engine is its own solver, with its own Newton loop, convergence
test and failure report: P-Delta, co-rotational, arc-length, material nonlinear, fiber, contact,
cable, plastic, staged and SSI ([nonlinear.md](nonlinear.md)). Adding a nonlinear shell or solid
material that way means one more loop per material and per element. This framework is for what
comes next: a new material, element or solution strategy is written once and works with all the
others.

The existing solvers stay as they are. They are the oracles the framework is tested against.

## Layers

| Layer | Trait | Answers | Implemented |
|---|---|---|---|
| Material | `UniaxialMaterial`, `PlaneStressMaterial` | stress and consistent tangent at one point, from a trial strain and the last committed state | `Elastic1D`; `FiberLaw1D` (the fiber solver's laws, called as they are); `PlaneStressElastic`; `PlaneStressJ2` |
| Section | `FiberSection2D` | resultants and their tangent, integrating materials over the section | fibers; `rectangle` helper |
| Element | `Element`, with `Kinematics` | internal force and tangent from nodal displacements | `Frame2D` (basic response `ElasticBasic2D` or `FiberBasic2D`), `Truss2D` |
| Driver | `solve` | R(u, λ) = λ·F − f_int(u) = 0 | load control, displacement control |

Second-order behaviour belongs to the element's kinematics, not to its material:
`Kinematics::Linear` (small displacements) or `Kinematics::Corotational` (large displacements
and rotations, small strains; Crisfield vol. 1 ch. 7). The same fiber section gives an inelastic
small-displacement analysis under one and an inelastic large-displacement analysis under the
other.

### The state contract

`update` / `set_trial_strain` compute a trial state from the last committed one. The driver calls
`commit` on a converged step and `revert` on a failed one. An iteration that does not converge
never writes path-dependent state (plastic strain, back stress, cracking).

## The driver

- **Newton–Raphson** with the consistent tangent. Each element provides the tangent, and the
  tests check it against finite differences.
- **Load control**, and **displacement control** (Batoz–Dhatt). Displacement control follows
  snap-through, but not snap-back; that needs arc-length.
- **Step cutting.** A failed step is reverted and halved, up to `max_cuts` times. After a cut the
  step grows back toward the nominal size.
- **Convergence test.** Converged when ‖R‖ ≤ tol·max(|λ|·‖F‖, ‖f_int‖), or when ‖R‖ reaches the
  rounding floor ≈ ε·‖K‖·‖u‖. Without the floor, a stiff axial term next to a flexible bending
  term (EA·L²/EI ≥ 10⁸) leaves Newton iterating on noise. The norm mixes forces and moments,
  unscaled, as the existing solvers do.
- **Limit points under load control.** Load control cannot pass a limit point, and Newton past
  one can land on a distant stable branch, reporting a dynamic jump as a static path. The
  driver stops with `StopReason::LimitPoint` when any of these holds:
  - an iterate's tangent changes the sign of its determinant;
  - the converged step lands outside ¼–4 times the length of the committed tangent's
    prediction (on a continuous path that ratio tends to 1 as the step is cut; a jump stays out
    of the band);
  - Bergan's current stiffness parameter falls below 10⁻³.
- **Failure contract.** `Outcome.u`, `lambda` and `reactions` are always the last converged
  state, never an unconverged iterate. `termination` says why the analysis stopped. `Err` is
  only for an invalid request. This is the contract the existing solvers do not share (audit
  2026-10, S2).

## Validation (`engine/tests/nonlinear_framework.rs`)

| Test | Checks against |
|---|---|
| Elastic frame, linear kinematics | `solver::linear::solve_2d`, to 1e-9 |
| Elastic cantilever, PL²/EI = 5, co-rotational | `solver::corotational::solve_corotational_2d`, to 1e-6 |
| End moment rolls a cantilever into ¾ of a circle (θ = 270°) | closed form, 2e-3·L |
| Tip load, PL²/EI = 1, 2, 5, 10 | Mattiasson's elastica, to 1e-3·L |
| Two-bar truss snap-through under displacement control | closed form along the whole path, including negative loads |
| Load control past the truss's limit point (7, 15, 16, 23 increments) | stops with `LimitPoint` on the near branch, in equilibrium |
| Plastic cantilever, small displacements | 3EI/L³; the collapse load converges to Mp/L from above at first order; the extrapolation lands within 0.5 % |
| Plastic cantilever, large displacements | equilibrium on the deformed shape, M_support = P·(L + uₓ); the load rises above Mp/L |
| Element tangents, elastic and partly yielded, small and large rotation | central differences |
| Plane-stress J2 | yield in equal biaxial tension and in pure shear; the stress returns onto the hardened surface; consistent tangent against finite differences; elastic unloading; only committed state persists |

## Limitations of the draft

- **2D frames and trusses only.** Nodal loads only: no element loads, self-weight or thermal
  loads.
- **Dense LU.** Fine for these tests, and too slow beyond a few hundred DOFs. The limit-point
  checks use the determinant's sign, which detects an odd number of eigenvalue crossings. A
  sparse LDLᵀ with the inertia count is the replacement for both.
- **Displacement-based fiber elements.** They need several elements per member and overestimate
  collapse loads at first order in the element size. A force-based element is the usual remedy.
- **No arc-length yet,** so no snap-back.
- **The limit-point checks are heuristics.** The jump ratio and the stiffness parameter are
  validated on the cases in the tests, and on nothing else yet.
- **Not wired to WASM or the app,** and not part of any certificate.

## Next

1. **Layered shell.** A layered section that integrates `PlaneStressMaterial` through the
   thickness (Simpson or Gauss). Then a flat shell element (MITC4: membrane, bending and drilling
   from `element/quad.rs`) with linear and co-rotational kinematics. Together with
   `PlaneStressJ2` this gives EN 1993-1-5 Annex C / EN 1993-1-14 plate analysis, and GMNIA with
   imperfections shaped like the buckling modes.
2. **Sparse factorization of indefinite tangents** with the inertia count, and arc-length
   (Crisfield).
3. **3D frames** (co-rotational 3D), checked against `solve_corotational_3d`.
4. **Cracked-slab deflection** as a secant concrete-with-rebar layer law on the same shell.
5. **WASM entry point and the failure contract in the app**, behind `feature_gates`.
