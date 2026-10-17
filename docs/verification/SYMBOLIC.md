# Symbolic derivation of the frame element matrices

The result certificates ([CERTIFY.md](CERTIFY.md)) prove that the solver solved its *own*
assembled system accurately. They say nothing about whether that system is the right one: a
wrong entry in an element matrix gets certified like any other. The OpenSees differential tests
catch some of these, but only where OpenSees has the same element and only to the accuracy of a
comparison between two floating-point codes.

This check derives the frame-family element matrices **from first principles**, using shape
functions and an energy or virtual-work expression in SymPy, and compares the Rust kernels against
the exact result.

- `tools/symbolic/derive.py`: the derivations. Its `checks()` also confirms that each derived
  matrix equals its closed form in the literature (Przemieniecki, Archer, Barsoum–Gallagher), so
  the derivation and the textbook vouch for each other.
- `tools/symbolic/gen.py`: evaluates the derivations at random parameter points and writes
  `engine/tests/symbolic_elements.rs`.
- CI: `engine/tests/symbolic_elements.rs` runs with the rest of the engine suite. The `symbolic`
  job in `.github/workflows/verify.yml` regenerates the file and fails on any difference
  (`gen.py --check`, about 20 s).

```sh
python3 -m venv tools/symbolic/.venv
tools/symbolic/.venv/bin/pip install -r tools/symbolic/requirements.txt
tools/symbolic/.venv/bin/python -I tools/symbolic/gen.py          # write the test
tools/symbolic/.venv/bin/python -I tools/symbolic/gen.py --check  # CI's check
cd engine && cargo test --release --test symbolic_elements
```

## How the comparison is exact

Every parameter (E, G, A, I, J, Cw, L, φ, load values and positions, axial force, densities) is an
f64 drawn from a fixed seed. Every f64 is a rational number, so the generator evaluates the
derivation at exactly the value the Rust call receives, in rational arithmetic. The transformations
involve square roots and cosines, so they are evaluated to 50 digits instead. The expected value
written to the test is the correctly rounded f64 of that exact value. The test then requires each
kernel entry to be within 1e-13 relative error, with scales chosen so the tolerance does not
depend on units:

- **Matrices.** Entry (i, j) is compared relative to max(|K_ij|, √|K_ii·K_jj|), the natural scale
  of a symmetric positive semi-definite matrix. A zero diagonal (a released DOF) demands exact
  zeros in its row and column.
- **Load vectors.** Forces are compared relative to the total load and moments relative to the
  total load × L, the size of the terms that cancel in them.
- **Rotations.** Absolute error of 1e-13.

The random draws use only correctly rounded operations, so the generated file is the same on every
platform. CI relies on this to compare it byte for byte.

## Coverage

| Kernel | Derivation | Cases |
|---|---|---|
| `truss_local_stiffness_2d/3d`, `truss_global_stiffness_2d/3d` | ½∫EA·u'² with linear shapes; global = Tᵀ·k·T with rational direction cosines | 32 |
| `frame_local_stiffness_2d` | axial + bending; EB from ½∫EI·v''² over cubic Hermite shapes; Timoshenko from ½∫(EI·ψ'² + GAs·(v'−ψ)²) over the interdependent shapes, which are *solved for* as the exact homogeneous solutions of the Timoshenko equations; all 4 hinge combinations by static condensation | 24 |
| `frame_local_stiffness_3d` | axial, St-Venant torsion ½∫GJ·θ'², both bending planes (θz = v', θy = −w'), EB and Timoshenko with independent φy, φz, **all 64 release combinations** | 128 |
| `frame_local_stiffness_3d_warping` | cubic Hermite twist, ½∫(GJ·θ'² + ECw·θ''²) (Barsoum & Gallagher 1970; McGuire, Gallagher & Ziemian §8.4), with releases | 28 |
| `frame_kg_local_2d/3d`, `truss_kg_2d/3d` | ½∫P·v'² with cubic Hermite v. A released rotation follows the elastic (EB) map, so Kg_c = Tᵀ·Kg·T, the same work over the propped-cantilever or pinned shapes N·T. All 4 (2D) and 64 (3D) release combinations. Trusses: (P/L)(I − eeᵀ) | 92 |
| `frame_consistent_mass`, `truss_consistent_mass`, `frame_consistent_mass_3d`, `frame_consistent_mass_3d_warping` | ½∫ρA·\|u̇\|²: Hermite transverse, linear axial, ρ(Iy+Iz) linear torsion, and for warping members ½∫ρ(Ip·θ̇² + Cw·θ̇'²) over the cubic twist; half-mass lumping (translations only) with releases | 36 |
| `fef_distributed_2d`, `fef_partial_distributed_2d`, `fef_point_load_2d` (force, axial force, couple), `fef_thermal_2d`, each followed by `adjust_fef_for_hinges` | ∫q·N + P·N(a) + M·Ψ(a) with the element's own shapes (Hermite or Timoshenko), then condensed for the hinges | 40 |
| `fef_distributed_3d`, `fef_partial_distributed_3d`, `fef_point_load_3d`, `fef_thermal_3d`, each followed by `adjust_fef_for_hinges_3d` | same, per plane (local y ↔ φz, local z ↔ φy, θy = −w'), random releases | 32 |
| `axial_distributed_fef` | ∫q·N_lin on [a, b] | 10 |
| `fef_distributed_torsion_warping` | ∫t·N with the cubic twist shapes | 8 |
| `timoshenko_deflection_shapes`, `timoshenko_rotation_shapes` | the solved interdependent shapes | 24 |
| `frame_transform_2d`, `truss_transform_2d`, `compute_local_axes_3d`, `frame_transform_3d(_warping)` | local axes from their geometric definition (below) | 140 |

Total: 594 kernel calls, each comparing every entry of a matrix or vector.

**Equivalent loads checked against an independent solution.** Every member load in the test is
also solved in the generator a second way, with no shape functions. The generator solves the
Timoshenko (or EB) equations of the loaded member piecewise and exactly:

- (GAs·γ)' = −q and EI·ψ'' + GAs·γ = 0, where γ = v' − ψ.
- The shear jumps by −P at a point force and the moment jumps by −M at a couple.
- Each end is either fixed or released (no support moment).

The equivalent nodal loads are then the negated support reactions taken from the boundary terms of
the total potential. The generator asserts that this equals the consistent load condensed for the
releases. It proves symbolically, case by case, that the consistent loads with the interdependent
shapes are the exact fixed-end forces (reciprocity) and that the hinge condensation is exact.

**Local axes, from their definition rather than the kernel's algorithm.**

- **Default.** ez ∝ ex×(up×ex), with up = Z, or X when |ex·Z| > 0.999. Then ey = ez×ex.
- **Explicit local-y vector r.** ey ∝ ex×(r×ex) and ez = ex×ey. When r ∥ ex, the kernel falls
  back to X, or to Y when the member is within acos 0.9 of X.
- **Roll angle β.** Both axes are rotated about ex by Rodrigues' formula.
- **Left-handed.** ey is reversed.

The cases include vertical and near-vertical members, a parallel local-y vector, non-integer
roll angles and both handednesses.

### Conventions the derivation makes explicit

- The rotational DOF of a Timoshenko member is the section rotation ψ, not v'.
- Thermal gradients follow the engine's existing sign conventions, which the web layer maps to
  (see `web/src/lib/engine/solver-service.ts`):
  - 2D ΔTg = T(−y) − T(+y).
  - 3D ΔTgy = T(−y) − T(+y).
  - 3D ΔTgz = T(+z) − T(−z).

  The two 3D gradients take opposite faces as positive. This is long-standing and documented, and
  it is reproduced here, not changed.
- The thermal bending loads EI·κ0·[0, −1, 0, 1] do not depend on φ. Thermal loads with releases
  are condensed like any other.

### Formulation choices documented, not changed

- **Kg ignores shear flexibility.** Every member, including Timoshenko members, uses the cubic Kg.
  The shear-consistent Kg, the same work over the interdependent shapes, is
  P/(30L(1+φ)²)·[6(5φ²+10φ+6), 3L, …; 3L, L²(5φ²+10φ+8)/2, −3L, −L²(5φ²+10φ+2)/2; …]. It equals
  the cubic Kg at φ = 0 and differs for φ > 0. `derive.kg_timoshenko` derives it, and `checks()`
  asserts the difference.
- **Released rotations in Kg use the Euler–Bernoulli elastic map**, even for Timoshenko members.
  The map consistent with a Timoshenko K would be θ_r = 6/(L(4+φ))·Δv − (2−φ)/(4+φ)·θ_other.
- **Kg has no torsional term.** Stabileo's Kg omits the P·Ip/(A·L) torsion term of the full
  Przemieniecki / McGuire 3D matrix.
- **Mass.** The consistent mass is Euler–Bernoulli for every member: there is no rotary inertia
  and no shear correction. Torsion uses Ip ≈ Iy + Iz. A member with any release is lumped
  (ρAL/2 on each translation, nothing on rotations).

## Discrepancies found

Each one has a regression test, and each fix is in the CHANGELOG.

1. **The 2D geometric stiffness ignored hinges** (fixed). `frame_kg_global_2d` used the
   fixed-fixed Kg whatever the hinges, so a hinged rotation got −4PL/30. Only the solver's
   artificial rotational stiffness (1e-10·max diag) held it, and any frame with a pin-ended member
   buckled at λ ≈ 1e-6:
   - a leaning-column frame gave λ = 5e-6 instead of 3.75;
   - a column pinned by a member release gave λ = 1.3e-6 instead of Euler's 11.2.

   The 3D Kg had been fixed for this earlier. The 2D one now uses the same condensation through a
   shared `condense_kg_plane`. Tests: `engine/tests/geometric_stiffness_releases.rs`
   (`plane_*`).
2. **The warping torsion block mixed interpolations** (fixed). Its St-Venant part was GJ/L on the
   twist DOFs, the energy of a *linear* twist, while its warping part used the *cubic* twist. The
   result converges, but as h² instead of h⁴. On a cantilever with kL ≈ 2.4 the tip twist was 11%
   off with one element and 0.8% off with four (now under 2% and 1e-4). The block is now the energy of
   the cubic twist, GJ/(30L)·[36, 3L, −36, 3L; …] + ECw/L³·[12, 6L, …]. Test:
   `validation_warping_cantilever_end_torque_matches_vlasov`.
3. **The distributed-torque loads on the warping element were inconsistent** (fixed; the function
   had no callers). `fef_distributed_torsion_warping` mixed three different load models:
   - the twist DOFs used the linear-shape split;
   - the warping DOFs used Vlasov's exact uniform-torque bimoments, with the opposite sign;
   - the triangular part was labelled "simplified" and multiplied its shape functions by zero.

   It now returns ∫t·N for the element's cubic twist.
4. **The warping DOFs had a dimensionally wrong lumped mass** (fixed; found while deriving the
   mass). Each warping DOF (a rate of twist) got ρ·Ip·L/2, which is a rotation's inertia. A
   fork-supported I-beam's first torsional frequency came out 10.6% low. Warping members now get
   the consistent 14×14 mass of their cubic twist. Test:
   `validation_warping_fork_beam_torsional_frequency`.
5. **The 3D co-rotational solver fails on pin-ended members** (not fixed; reproduced by the ignored
   test `corotational_3d_leaning_column_matches_pdelta`).
   - At vanishing load it does not converge on the leaning-column frame.
   - At P = 0.2·k·h it converges to *less* sway than the linear solve.
   - Its tangent also uses the fixed-fixed Kg whatever the releases. Swapping in the condensed
     kernel changes neither result, so the fault is in how the co-rotational element treats
     released ends. It is outside the element kernels.

All other kernels agreed with the derivation to round-off on the first run:

- frame stiffness (EB, Timoshenko, all release combinations);
- truss stiffness;
- every 2D/3D fixed-end force and hinge condensation, including the Timoshenko-consistent ones;
- 3D Kg with releases;
- the 2D/3D consistent and lumped mass;
- the Timoshenko shape functions;
- all transformations.

## Not covered here

- The connector and solid-shell elements, which other work covers.
- Shells, cables, curved beams and fiber beams. Their kernels are not closed-form polynomial
  integrals of this kind.
- Element force recovery and assembly. The certificates and `determinate_exact.rs` cover those.
