# Certified linear static results

The Rust checker (`engine/src/certify/`) and the Lean proofs (`verify/`) implement and
prove this contract. Change both together.

What a certificate does **not** cover: the discretization (mesh) error, how far the assembled
system's solution is from the structure the mesh stands for. That is estimated, never certified:
see `DISCRETIZATION.md`.

## Setting

After eliminating restrained DOFs the solver solves `K u = f`, with `K` an n×n real
matrix (the assembled free-free stiffness, in f64), `f` the effective load vector.
The solver returns an approximation `ũ`. Let `u*` be the exact real solution.

`K` is *not* assumed bitwise symmetric (floating-point `Tᵀ k T` need not be).

This certifies the solve of the `K` and `f` the engine assembled. For frame and truss
models the linear result is also certified against an independent re-assembly of the
model ("End-to-end certificates" below), which covers model → `K` → result.

## Theorem (coercivity error bound)

Let `S = (K + Kᵀ)/2`, `σ > 0`. If `S − σI` is positive semidefinite then for all x:

    σ‖x‖² ≤ xᵀSx = xᵀKx ≤ ‖x‖‖Kx‖     so     ‖Kx‖ ≥ σ‖x‖.

Hence K is invertible, `u*` exists and is unique, and with `r = f − Kũ`:

    ‖u* − ũ‖₂ ≤ ‖r‖₂ / σ.

## Certifying `S − σI ⪰ 0` (strictly: ≻ 0)

Run Cholesky on `M = S − σI` in interval arithmetic with outward rounding. Every
entry of the exact real `M` lies in its interval. Inclusion monotonicity means every
intermediate real quantity of exact Cholesky on `M` lies in the corresponding
interval. If every pivot interval (before the square root) has a strictly positive
lower bound, the exact real Cholesky of `M` has positive pivots, so `M` is positive
definite (Schur complement induction).

## Certifying `‖r‖₂`

Compute `r = f − Kũ` in interval arithmetic, then `ρ = ‖r‖₂` rounded up
(sum of squares of max |endpoint|, sqrt, all rounded up).

## Output

`bound = ρ / σ` rounded up, plus `rel = bound / ‖ũ‖₂` (rounded up). `σ` is chosen
heuristically (e.g. 0.9 × an estimate of λ_min(S)); soundness does not depend on how.
On failure (pivot not certified positive, non-finite value) the result is
`Uncertified { reason }`, never a wrong bound.

## Scalable certificate (Gram residual + Gershgorin)

For sparse/large systems the dense interval Cholesky is replaced by a check that is
linear in the number of nonzeros of `L` and `R`. The checker picks *any* real matrix
`L` — in practice the floating-point sparse Cholesky factor of `S − tI` for some shift
`t`, with rows permuted — and encloses the residual entrywise in intervals:

    R = S − L Lᵀ,   Rᵢⱼ ∈ IRᵢⱼ   for all i, j.

`R` is symmetric (both `S` and `L Lᵀ` are), and `xᵀ L Lᵀ x = ‖Lᵀx‖² ≥ 0` for every
real `L`. If for every row i

    μ ≤ IRᵢᵢ.lo − ∑_{j≠i} mag(IRᵢⱼ)        (interval Gershgorin row test)

then `μ‖x‖² ≤ xᵀRx` (from `|xᵢxⱼ| ≤ (xᵢ² + xⱼ²)/2` and symmetry of `R`), so

    xᵀKx = xᵀSx = xᵀ L Lᵀ x + xᵀRx ≥ μ‖x‖²,   i.e.  λ_min(S) ≥ μ.

If `μ > 0`, `σ := μ` certifies coercivity and the error bound above applies:
`‖u* − ũ‖₂ ≤ ρ / μ`. Soundness is independent of how `L` was computed: its fill-reducing
ordering, rounding errors, underflow, FMA, or even whether it is triangular only affect
the size of `R` (hence whether the test passes), never the validity of the bound. Only
the enclosure of `S − L Lᵀ` must be computed with outward rounding.

Lean: `Certify.certified_error_bound_gram` (`verify/Certify/Gram.lean`), built on
`quad_gram_nonneg`, `gershgorin_quad` and `coercive_of_gram`.

## Constraints (multi-point constraints)

The constrained solver (`solve_constrained_{2d,3d}`) writes the free displacements as
`u_F = C q + u_p`, with `C` the free rows / free-independent columns of its constraint
transform, `C_R` the free rows / restrained-independent columns, `u_R` the prescribed
values and `u_p = C_R u_R`. The f64 entries of `C` (as `build_constraint_transform`
computes them, offsets included) and of the assembled `K`, `f` define the problem. The
certified statement is about the exact real solution of

    find q:  Cᵀ (f_F − K_F· [C q + u_p ; u_R]) = 0,        u*_F = C q* + u_p,

where `K_F·` is the free rows of the solver's `K` (the dense assembly on the dense path,
the sparse `k_ff`/`k_full` pair on the sparse path, chosen from the results' diagnostics
in 2D; always the sparse assembly in 3D).

* `A = Cᵀ K_FF C` is formed entrywise in interval arithmetic from the f64 `K` and `C`
  (no rounded reduced matrix is trusted); its symmetric part `Cᵀ S C` is enclosed on the
  lower triangle and certified `λ_min ≥ μ > 0` by the Gram residual + Gershgorin check
  above. Then `A` is invertible, `q*` is unique and `‖q* − q̃‖₂ ≤ ‖r‖₂ / μ`, with
  `r = Cᵀ(f_F − K_F·[C q̃ + u_p ; u_R])` evaluated in intervals.
* `q̃` is read from the returned displacements at the independent DOFs. Any `q̃` is a
  valid candidate; the mismatch is accounted for in the next step.
* Mapping back: `u*_F − ũ_F = C (q* − q̃) + (C q̃ + u_p − ũ_F)`, so

      ‖u*_F − ũ_F‖₂ ≤ ‖C‖₂ · ‖r‖₂/μ + ‖C q̃ + u_p − ũ_F‖₂,

  with `‖C‖₂ ≤ min(√(‖C‖₁‖C‖_∞), √(maxₐ Σ_b |(CᵀC)_ab|))` rounded up and the last
  term enclosed in intervals (it covers the solver's f64 expansion `C q̃ + u_p`, and any
  constraint violation in the returned displacements).

The certificate's `sigma` is `μ` and `residual_norm` is `‖r‖₂` (reduced quantities);
`abs_bound` is on the free-DOF error. Code: `engine/src/certify/constrained.rs`.
Not yet formalized in Lean (the coercivity and Gram/Gershgorin steps are the ones
proved above; the `‖C‖₂` mapping is elementary but unproved there).

## Inclined supports

The solver rotates the translational DOFs of an inclined node by the f64 matrix `R`
(rows = local axes), `u_rot = T u_glob` with `T` block-diagonal, assembles `K`, `f` in
those axes, solves, and reports `ũ_glob = fl(Tᵀ ũ_rot)`. The certified exact global
solution is `u*_glob := Tᵀ u*_rot` (the exact real product with the f64 `R`).

The candidate `ũ_rot = fl(T ũ_glob)` (with the solver's prescribed normal value put back
on the restrained rotated DOF) is certified in the rotated system exactly as above (plain
or constrained), giving `‖u*_rot − ũ_rot‖₂ ≤ b` (restrained rotated DOFs are exact).
Then over all DOFs

    ‖u*_glob − ũ_glob‖₂ ≤ ‖T‖₂ b + ‖Tᵀ ũ_rot − ũ_glob‖₂,

with the last term enclosed in intervals and, for any real `R` (no orthogonality is
assumed), `‖R‖₂² = λ_max(RᵀR) ≤ 1 + ‖RᵀR − I‖_F` with `RᵀR − I` enclosed in intervals;
`‖T‖₂ ≤ max(1, max_R √(1 + ‖RᵀR − I‖_F))`, which is `1 + O(ε)` for the solver's
rotations. With inclined supports `abs_bound` is on the error over all DOFs in global
axes (and `rel_bound` relative to `‖ũ_glob‖₂` over all DOFs). A node carrying several
supports one of which is inclined is refused (`Uncertified`). Not yet formalized in Lean.

## End-to-end certificates

Everything above certifies the solution of the f64 `K` and `f` **the engine assembled**. An
assembly bug (a wrong sign in a transformation, a missing Timoshenko term, a wrong
fixed-end force) would be certified. The end-to-end check closes that gap: it rebuilds the
model's `K` and `f` from the model JSON, independently of the engine, and certifies the
returned displacements against that. Code: `engine/src/certify/reassembly/`; Lean:
`verify/Certify/EndToEnd.lean`.

### What it states

`EndToEnd::Certified { absBound, … }` means: the model as written (every input number
taken as the decimal of the JSON, enclosed by the half-ulp interval around its parsed
f64) has a unique solution `u*`, and `‖u* − ũ‖₂ ≤ absBound` over every DOF the model
determines, all DOFs in global axes, restrained ones included. The engine's own `K` and
`f` play no part in that statement; they are compared separately (below).

### The independent re-assembly

Written for this checker from the mechanics, in interval arithmetic
(`certify::interval` plus rigorous `sin`/`cos` by range reduction with an enclosure of
π and a Taylor series with its remainder, so no libm), with its own DOF numbering
(`(node, local dof)`, nodes by id). Nothing in `engine/src/element/` or the solver's
assembly is called to build it.

* **Bending** of each plane: the cantilever flexibility
  `F = [[L³/3EI + L/(G·As), L²/2EI], [L²/2EI, L/EI]]` (Timoshenko: shear adds `L/(G·As)` to
  the tip deflection, nothing to the section rotation), `k = F⁻¹`, and the other end by
  equilibrium, `K = [[Γ k Γᵀ, Γ k], [k Γᵀ, k]]`, `Γ = [[−1, 0], [−L, −1]]`. In the x–z
  plane of a 3D member `θy = −dw/dx`, so its block is the x–y one with the rotations
  negated. Axial `EA/L`, torsion `GJ/L`.
* **Releases and hinges**: static condensation of each released rotation, one at a time
  (`K ← K − k_r k_rᵀ/k_rr`, `f ← f − k_r f_r/k_rr`). Both rotations of a plane released:
  the plane carries nothing (its bending block has rank 2 and an invertible rotation
  block, so the Schur complement is 0) and its loads reach the nodes as the simply
  supported reactions. A torsion release at either end removes torsion.
* **Equivalent nodal loads**: the work of the member load on the exact deflected shapes
  of the unloaded Timoshenko member (the interdependent-interpolation functions
  `N₁…N₄` for forces, the section rotations `ψ₁…ψ₄` for couples; cubic Hermite for
  `φ = 0`), with the polynomial integrals over `[a, b]` in closed form
  (`(b − a)∫₀¹ q(t) N(ξₐ + tΔξ) dt`, no division by `b − a`); axial loads on the linear
  shapes; trusses and cables by the lever rule; thermal loads from `∫ Bᵀ D ε_th dx`
  (axial `∓EAαΔT`, curvature moments `∓EI·α·Δt/h`).
* **Local axes**: the model's conventions, re-derived (default: local z = global Z made
  perpendicular to the member, global X for |x·Z| > 0.999; reference vector: local
  z ∥ x × ref; roll angle in degrees; `leftHand` negates local y). A switch whose
  interval straddles its threshold is refused, not guessed.
* **Kinematics** `u = C q + p`: free DOFs; restrained DOFs at their prescribed value;
  inclined supports as a tangent parametrization (`u = t q + n (n·d)/(n·n)`, 2D normal
  `(sin θ, cos θ)`, 3D any exact basis of the plane `⟂ n`); springs (rotated in 2D) as
  stiffness; rigid links, diaphragms, eccentric connections (rigid-body kinematics
  `u_s = u_m + θ_m × r`), equal-DOF and linear MPCs (eliminating the largest free term)
  by substitution, chains resolved, cycles refused.
* **Self-weight** reaches the engine as member distributed loads (the app converts it),
  so it is covered as such.

### The certificate

With `A = Cᵀ K C` enclosed entrywise (exact for every model in the input box):

1. **Coercivity**: the Gram residual + Gershgorin test of "Scalable certificate" on the
   interval `A` gives `λ_min(A) ≥ μ > 0`.
2. **Residual** `r = Cᵀ(f − K w)`, `w = C q̃ + p`, with `q̃` read from `ũ` (any `q̃` is
   valid). `K w` is formed element by element on deformations: `K_e w_e = K_e (w_e − ρ_e)`
   for the rigid motion `ρ_e` that matches the element's first node (translation `t`,
   rotation `θ`, `u_j = t + s θ × Δ` with `s = det R` of the local frame), which the
   exact `K_e` annihilates. A stiff short member then contributes its small deformation
   times its stiffness, not its displacement times its stiffness. A tripwire checks this
   enclosure against the plain `f − K w` enclosure: both contain the same real numbers,
   so they must intersect.
3. **Bound**: `‖u* − ũ‖₂ ≤ √g · ‖r‖₂/μ + ‖w − ũ‖₂`, where `g` bounds every row sum of
   `|CᵀC|` (so `‖C x‖ ≤ √g ‖x‖`).

Lean (`verify/Certify/EndToEnd.lean`): `Certify.end_to_end_bound` (from
`certified_error_bound_gram`: unique `q*`, the bound above), `Certify.virtual_work` (the
reduced equations `Cᵀ K (C q + p) = Cᵀ f` are virtual work over the admissible
variations `C v`), `Certify.vnorm_mulVec_le_of_rows` (`‖C x‖ ≤ √g ‖x‖`). In the axiom
check.

**DOFs the model does not determine** (a structurally empty row of `A`: the rotation of a
truss-only node, of a node where every member is released) are left out of the bound and
listed in `excludedDofs`. A load on such a DOF means the model has no solution:
`Failed`.

### Agreement with the engine, and statuses

Besides the bound, the result must be the engine's answer to *this* model:

* **Assembly**: the engine's `K` and `f`, exactly the assembly the solver factored for this
  solve (`certify::solver_assembly_2d/3d`: dense below 64 free DOFs, sparse above, the
  constrained paths; a dense assembly over `4 · MAX_CERTIFY_N` DOFs is not read and the
  result is `uncertified`), rotated back at inclined supports, must lie within `1e-10` of
  each entry's scale (`Σ|terms|`, or `√(K_ii K_jj)`) of the re-assembled enclosures. A NaN
  or infinity anywhere in it is a failure. The engine's artificial stiffness on DOFs the
  model does not determine is not compared.
* **Kinematics**: `‖C q̃ + p − ũ‖ ≤ 1e-9 ‖ũ‖`: the returned displacements satisfy the
  model's supports, settlements, inclined supports and constraints.

| `endToEnd.status` | meaning |
|---|---|
| `certified` | both checks pass and the bound holds: `absBound`, `relBound`, `mu`, `residualNorm`, `kDiscrepancy`, `fDiscrepancy`, `excludedDofs` |
| `failed` | the engine assembled a different `K` or `f`, returned displacements that violate the model's kinematics, or answered a model that has no solution |
| `uncertified` | no bound against the model could be established (a mechanism the engine's artificial stiffness hides, or conditioning beyond what an `ε`-wide enclosure of the exact model allows) |
| `outOfScope` | the model uses something not re-assembled (below) |

`certificateLevel` on the certified linear result is `endToEnd` when both the
assembled-level and the end-to-end certificates hold, `assembled` when only the former
does, `none` otherwise. Wasm `certify_linear_2d` / `certify_linear_3d` return both.

**Scope.** 2D and 3D frames (Euler–Bernoulli and Timoshenko), trusses and cables
(linear), hinges and releases, local axes with reference vectors, roll angles and
left-handed axes, supports with springs and settlements, inclined supports, rigid links,
diaphragms, equal-DOF, eccentric connections, linear MPCs; nodal, distributed (full,
partial, trapezoidal, axial), axial span (`axialDistributed`), point and thermal member
loads. **Out of scope**
(`outOfScope`): shells and solids, connectors, curved beams, warping torsion (sections
with `Cw > 0` on frames) and bimoment loads, several non-plain supports on one node.
There are no rigid end offsets in the model format. Shells are next.

**Nothing is dropped.** Every input field the check reads is modelled or refused
(`engine/tests/certify_end_to_end_inputs.rs`, one negative test per field): a load on a
node, member or DOF the model does not have (a moment on a model with only trusses and
cables, which has no rotations) is `failed` (nothing resists it); a support value its type
does not use (a settlement on a DOF the support leaves free, an angle on a fixed support,
a rotational spring or prescribed rotation without rotations, a normal on a support that is
not inclined, warping restraints) and a constraint naming a DOF the model does not have
(or needing a rotation it lacks for its offset) are `outOfScope`. Ignored by design, because
they cannot change the mechanics: hinge flags and releases on trusses and cables (they
carry no moment), a thermal gradient on a truss (a pin-ended bar curves freely), section
properties a member type does not use.

### Tests

`engine/tests/certify_end_to_end.rs`, all in the normal suite:

| set | models | certified end to end | engine assembly vs re-assembly |
|---|---|---|---|
| 2D fixtures (examples, web templates, `random-*`) | 82 | 82 (every assembled-level certified one) | identical (discrepancy 0) |
| 3D fixtures (`ex-3d-*`, `random3d-*`) | 32 | 32 | identical |
| stable random frames, 2D (`tests/e2e_models`) | 200 | 200 | identical |
| stable random frames, 3D | 150 | 150 | identical |
| fuzz generators (`fuzz_models`, rich and plain), 2D | 300 | 56; 42 out of scope (the rich generator puts settlements on DOFs their support leaves free, refused); 1 uncertified and 2 with no solution, see findings | identical |
| fuzz generators, 3D | 240 | 20 (most are mechanisms the solver refuses); 4 out of scope; 1 uncertified (ill-conditioned beyond `ε`) | identical |
| differential generators (`tools/differential`, 14 generators × 200, `e2e_dir`, run by hand) | 2800 | 2193; 201 out of scope (settlements on DOFs their support leaves free, refused); of the rest, every model the assembled-level certificate certifies except 6 (two `rich3d` models in three variants, singular in exact arithmetic, see findings) | identical |

The differential models: `python3 tools/differential/dump_models.py DIR 200`, then
`E2E_DIR=DIR cargo test --release --test certificates certify_end_to_end::e2e_dir -- --ignored --nocapture`.

The stable generators cover every feature in scope: jittered multi-bay frames, braces,
hinges and releases, shear areas, reference vectors, roll angles,
springs (rotated), inclined supports with settlements, every member load type,
diaphragms, rigid links, equal-DOF and MPCs.

**Planted bugs.** `engine/tests/certify_end_to_end_mutations.rs` plants each bug by
recomputing one element's contribution the buggy way (with the engine's own element
routines), swapping it into the engine's assembled `K` or `f`, and solving the buggy
system in f64 as the engine would. For each, the assembled-level certificate certifies
the wrong answer, the end-to-end certificate fails ("disagrees with the re-assembled
model"), and the end-to-end bound against the model still exceeds the real error:
wrong sign in the 2D transformation, the `(2 − φ)` Timoshenko term dropped, a uniform-load
fixed-end moment `qL²/8`, the 3D roll angle's sign, the 3D shear-area pairing swapped, the
`q_z` moments not negated. `scripts/e2e-planted-bugs.sh` plants bugs in the engine's
source (in a temporary git worktree of `HEAD`, never the checkout) instead and runs the end-to-end tests: all 15 caught (each fails the end-to-end tests; the assembled-level tests would pass): the 2D transform's `−sin`
sign; the `(2 − φ)` and `(4 + φ)` Timoshenko terms; the hinge's condensed factor `12/(4 + φ)` as 3;
the uniform-load end moment `qL²/12` as `qL²/8`; the sign of the Timoshenko moment correction of
the fixed-end forces; the `q_z` moments not negated in 3D; the `(2 − φ)` ratio of the hinge
fixed-end-force condensation; the thermal gradient moment's sign; the roll angle's sign;
`leftHand` not applied; `φ_y` paired with `Iz`; the rotated 2D spring's coupling sign; the truss
lever rule with its ends swapped; the thermal α 12e-6 as 1.2e-6.

**Findings** (`engine/tests/certify_end_to_end_findings.rs`):

* A **3D diaphragm in the XZ plane** tied the slaves with the rotation `θy` of the wrong
  sign, and the end-to-end check failed such results. Fixed with #342, which also ties
  each slave's in-plane rotation to the master's (the re-assembly follows: a diaphragm
  moves its slaves as one rigid body, rotation included). Before the re-assembly
  followed, the random 3D frames with diaphragms still certified end to end, but with
  bounds up to 80× the displacement: the check stays honest when the meaning of an input
  changes, it just stops being useful until the conventions are updated.
* **2D, all members hinged at a node**: a nodal moment there (the model has no solution)
  used to be absorbed by the artificial spring (1e-10 × the largest diagonal) and
  certified at the assembled level; the engine now refuses it before the solve. A rigid
  link from such a node still hides a real mechanism: the linked pair rotates freely,
  the spring holds it, and the assembled-level certificate certifies a meaningless
  answer (`relBound` 2e-15). The end-to-end check reports `failed` / `uncertified`.
* **Singular in exact arithmetic, regular in f64**: a node reached by one member released
  about its local y (`rich3d` 121 and 143) has a rotation about a skew axis that nothing
  stiffens. The engine's orphan guard looks at diagonal entries only, the rounded `K` is
  regular, and the assembled-level certificate certifies its solve. The end-to-end check
  cannot bound the model (`uncertified`).
* **`leftHand`**: with the local y negated the frame is improper (`det R = −1`) and the
  engine transformed rotations like translations, so its member matrices annihilated the
  *mirrored* rigid rotations, while rigid links, diaphragms and eccentric connections use
  `+θ × r`. Decided on `main`: the engine refuses `leftHand: true` before the solve, and the
  stable generators no longer produce it. The re-assembly still models it (the residual
  uses `s = det R`).

### What remains trusted

The re-assembly encodes the model's mechanics and conventions; that encoding (the formulas
of `element.rs`, the conventions of `model2d.rs`/`model3d.rs`) is trusted, written
independently of the engine and checked against it, but not proved. The interval
evaluation follows inclusion monotonicity (`Certify.Interval.mem_*`), not formalized
step by step for this code. The Rust implementation is not proved to match the Lean
algorithm (as for every Rust certificate). The engine's assembly is no longer trusted for
a result certified end to end.

## Independent checking: certificate bundles

The scalable certificate can be exported as a *bundle* and re-checked by a third party
without trusting the Rust interval code, the rounding model, or the f64 factorization.
The re-check is an executable Lean function whose soundness is a Lean theorem.

**Export (Rust).** `certify::bundle::export_linear_bundle(k, f, u)` runs the Gram
residual + Gershgorin certificate and writes the data it used;
`export_linear_bundle_{2d,3d}(input)` solve a model and export the bundle of its reduced
free-DOF system from the sparse assembly (any model size). Wasm:
`export_linear_bundle_{2d,3d}(json) -> bundle JSON`.

**Format** (`stabileo.linear-certificate.v2`, JSON; `v1` is `v2` without `provenance`
and is still read). Every f64 is written exactly as an
integer pair `[m, e]` meaning `m · 2^e` (`m` odd, or `[0, 0]`), so the checker sees the
exact dyadic rationals the engine used.

| field | meaning |
|---|---|
| `n` | number of unknowns |
| `k` | `{colPtr, rowIdx, values}`: lower triangle of the symmetric `K` (CSC); each stored `(a, b, v)` means `K[a][b] = K[b][a] = v` |
| `fLo`, `fHi` | enclosure `fLo ≤ f ≤ fHi` of the right-hand side (`f_F − K_FR u_R`; a point unless displacements are prescribed) |
| `u` | the computed solution `ũ` |
| `perm` | fill-reducing permutation, `perm[new] = old` |
| `l` | `{colPtr, rowIdx, values}`: the f64 Cholesky factor `L` of `P K Pᵀ − tI` in permuted numbering; it denotes `L'` with `L'[perm[a]][c] = L[a][c]` |
| `mu` | the claimed `μ`, `λ_min(K) ≥ μ > 0` |
| `bound` | the claimed bound `b`: `‖K⁻¹f − ũ‖₂ ≤ b` |
| `provenance` | what was solved, by which engine (see *Provenance* below; absent for a bundle exported from a bare matrix) |
| `info` | display copies of μ, b, ρ, relative bound (ignored by the checker) |

**Check (Lean, `lake exe certcheck <bundle.json>...`).** `Certify.Bundle.check`
(`verify/Certify/BundleCheck.lean`, core Lean + `Std` only, so it compiles natively
without Mathlib) works in exact arithmetic on dyadic rationals (`Dy`: `m · 2^e` with a
GMP `Int` mantissa; no gcd per operation, unlike `Rat`):

1. `R = K − L' L'ᵀ` exactly, one dense column of its lower triangle at a time, in fixed
   point (`L` scaled to integers by `2^-E`, `E` the smallest exponent in `L`; `R` by
   `2^-E2`, `E2 = min(2E, smallest exponent in K)`), from the columns and the
   (transposed) rows of `L'`; the cost is that of forming `L Lᵀ`, `Σ_c nnz(L_c)²/2`
   exact multiply-adds;
2. Gershgorin, for every row: `μ ≤ Rᵢᵢ − Σ_{j≠i} |Rᵢⱼ|`, accumulated into one array;
3. `K ũ` exactly, the residual interval `[fLo − Kũ, fHi − Kũ]` and
   `ρ² = Σᵢ max(|loᵢ|, |hiᵢ|)²`;
4. `0 < μ`, `0 ≤ b` and `ρ² ≤ (b μ)²` — no square roots (`√ρ² / μ ≤ b` follows:
   `Certify.Bundle.sqrt_div_le_of_sq_le`).

Exit status 0 if every bundle is accepted, 1 if one is rejected, 2 on a parse error.
The JSON reader (`verify/Certify/BundleParse.lean`) is trusted: it only turns `[m, e]`
into the dyadic `m · 2^e` and CSC into column lists.

Timings (Apple Silicon, one core, `check` only; the machine was shared):

| model | n | nnz(K) | nnz(L) | `certcheck` |
|---|---|---|---|---|
| `ex-3d-portal-frame` | 24 | 88 | 159 | < 1 ms |
| `ex-3d-tower` | 48 | 236 | 557 | 2 ms |
| `ex-3d-nave-industrial` | 1308 | 6 041 | 49 359 | 0.5 s |
| 6×6×8 frame building (generated) | 2352 | 13 048 | 365 762 | 11 s |
| 8×8×12 frame building (generated) | 5832 | 33 048 | 1 525 164 | 80 s (0.8 GB) |

The cost is dominated by the bignum multiply-adds of step 1 (about 90 ns each); the
f64 export of the same bundles takes 4 ms to 4 s.

**Soundness (`verify/Certify/BundleSound.lean`).**

* `Certify.Bundle.check_sound`: if `check d = true`, then for the real matrix
  `K = kMat d` and vector `ũ = uVec d` denoted by the bundle and *every* `f` with
  `fLo ≤ f ≤ fHi`: `K (K⁻¹ f) = f`, every solution of `K u = f` equals `K⁻¹ f`, and
  `‖K⁻¹ f − ũ‖₂ ≤ bound`. The proof applies `certified_error_bound_gram` with
  `L = lMat d`, point enclosures of the exact `R` (`resid_eq`), the residual interval
  above and `ρ = b μ`. The computation is related to the mathematics by `Dy.val_add`,
  `Dy.val_mul`, … (dyadic arithmetic is exact), `intAt_val` (the fixed-point encoding is
  exact), `resCol_val` (each dense column is the exact residual column), `gershSums_val`
  (the Gershgorin array holds exactly `Rₜₜ − Σ_{j≠t} |Rₜⱼ|`) and `mulVec_eq` (`K ũ`).
* `Certify.Bundle.check_sound_coercive`: `check d = true → μ‖x‖² ≤ xᵀKx` for all `x`.

Nothing about `L` or `perm` is checked: `L' L'ᵀ ⪰ 0` for every real `L'`, so a wrong
factor or a non-permutation can only make the Gershgorin test fail.

### Plastic collapse bundles

`certify::plastic_bundle::export_plastic_bundle_{2d,3d}(input)` (wasm
`export_plastic_bundle_{2d,3d}(json)`) export the plastic-collapse certificate of a 2D or
3D model (see "Plastic collapse load factor" below) as `stabileo.plastic-certificate.v1`.
All numbers are exact rationals written as decimal text `"n"` or `"n/d"`.

**The problem the bundle states** (a discretized rigid–perfectly-plastic limit-analysis
problem; `plastic.rs::limit_problem_2d`, `plastic_3d.rs::limit_problem_3d`). Unknowns: the
member end forces `x ∈ ℝ^nv` (`(Fx, Fz, Mᵢ)` per member in 2D, `(F, Mᵢ)` in 3D) and the
load factor `λ`.

| field | meaning |
|---|---|
| `rows` | equilibrium `Σ aᵢ xᵢ = λ p`: every free nodal DOF, every moment release |
| `members[].comps` | per bending component `c`: weight `n_c > 0`, enclosure `[mpLo_c, mpHi_c]` of the plastic moment |
| `members[].pieces` | `[a, b] ⊂ [0, 1]` and per component the cubic `M_c(t) = Σⱼ cⱼ tʲ`, each `cⱼ` an affine functional `{terms, lam}` of `(x, λ)` |
| `static` | `{lambda, x}`: the static certificate; `pieces[].cuts` are its cut points |
| `kinematic` | `{multipliers, hinges: [{member, piece, t, theta, diss}], lambda}` |

The pieces are the end sections `[0, 0]` and `[1, 1]` (the end moments `−Mᵢ`, `Mⱼ`) and the
load pieces between member-load breakpoints, `M(t) = −Mᵢ + t (d × F) − λ Lm(t)`. The yield
condition is `Σ_c M_c(t)² / (n_c Mp_c²) ≤ 1` at every `t` of every piece: in 2D one
component with `n = 1`, i.e. `|M(t)| ≤ Mp`; in 3D the biaxial ellipse
`(M_y/Mp_y)² + (M_z/Mp_z)² ≤ 1` with `M_y = C·u_y`, `n_y = |u_y|²` for the exact (non-unit)
local axes, checked exactly in rationals, no square roots.

**Check (Lean, `Certify.Plastic.check`, `verify/Certify/PlasticCheck.lean`, core only).**
* static: every row holds exactly at `(λ_lo, x)`; on every piece the chain
  `a ≤ cuts… ≤ b` covers `[a, b]` and on each segment
  `Σ_c B_c² / (n_c mpLo_c²) ≤ 1`, `B_c` the largest absolute Bernstein coefficient of the
  cubic `M_c` on the segment (Taylor shift, scale, four coefficients);
* kinematic: the multiplier-weighted rows equal the hinge-weighted moment functionals as
  linear forms in `x` (every coefficient, accumulated into one array, is exactly 0); the
  work `W = Σ_r u_r p_r + Σ_h Σ_c θ_{h,c} ∂M_c(t_h)/∂λ > 0`; each hinge lies on its piece,
  `D_h ≥ 0`, `D_h² ≥ Σ_c θ_{h,c}² n_c mpHi_c²`; and `Σ_h D_h ≤ λ_up W`.

**Soundness (`verify/Certify/PlasticSound.lean`).** For every assignment of plastic
moments `Mp_{m,c} ∈ [mpLo, mpHi]` (`MpIn`), with `Admissible d mp λ x` = equilibrium and the
yield condition at every point of every piece, and
`λ_c = collapseFactor d mp = sSup {λ | ∃ x, Admissible d mp λ x}`:

* `Certify.Plastic.static_sound`: `check d = true → Admissible d mp λ_lo x_static`
  (static theorem; uses `bern_bound`: on `[s, s']` a cubic is bounded by its largest
  absolute Bernstein coefficient, since `h³ q(s+v) = Σⱼ bⱼ C(3,j) vʲ (h−v)^(3−j)`);
* `Certify.Plastic.kinematic_sound`: `check d = true → Admissible d mp λ x → λ ≤ λ_up`
  (kinematic theorem, as LP weak duality: the checked identity gives
  `Σ_h Σ_c θ_{h,c} M_c(t_h) = λ W` for any equilibrium field — the virtual-work equation —
  and Cauchy–Schwarz against the ellipse bounds each hinge's term by `D_h`);
* `Certify.Plastic.check_sound`: both, and `λ_lo ≤ λ_c ≤ λ_up`.

So the bundle proves a lower and an upper bound on the collapse load factor **of the
discretized model under the stated yield condition** (bending only; axial force, shear and
torsion unlimited; associated flow is not needed for the bounds as stated). What this does
*not* cover: that the rows and moment functionals are the right ones for the structure in
the input (the model building in `plastic*.rs`: geometry, supports, releases, member-load
statics, the `Mp` enclosures from section data), exactly as a linear bundle trusts the
assembly of `K`.

The engine side: the static field is the engine's exactly equilibrated candidate scaled by
`s` (`s² U ≤ 1` for the bundle's own best-first Bernstein subdivision, within `2⁻³⁰` of the
best point value), the hinges are the engine's checked mechanism (rotations per component,
`ρ·u_c / n_c` in 3D), and the multipliers solve `Aᵀ u = Σ_h θ_h ∂M(t_h)/∂x` exactly. For the
biaxial condition the per-component Bernstein bound is a little more conservative than the
engine's degree-6 bound, so a 3D bundle's `λ_lo` can sit slightly (about `10⁻¹⁰`
relative) below the in-app value.

### Load-combination bundles

`certify::combination_bundle::export_combination_bundle_{2d,3d}(input)` (wasm
`export_combination_bundle_{2d,3d}(json)`) export `stabileo.combination-certificate.v1`
(numbers as exact `[m, e]` dyadics):

| field | meaning |
|---|---|
| `n`, `k`, `perm`, `l`, `mu` | the shared reduced stiffness, factor and `μ`, as in a linear bundle |
| `cases[]` | per load case: `fLo`, `fHi`, `u`, `bound` (a linear certificate over the shared `K`) |
| `combos[]` | `factors: [[case, cᵢ]]`, the computed combination `u` (free DOFs), its `bound` `B_j` |
| `envelope` | `maxAbs[k]` (the engine's max-abs displacement envelope) and `bound` `E` |
| `quantities` | member end forces (`labels` `e<id>.<start|end>.<component>`): `caseValues`, `caseBounds` (from `forces.rs`), `comboValues`, `comboBounds`, `envelopeBounds` |

**Check (`Certify.Combo.check`, `verify/Certify/ComboCheck.lean`).** Gershgorin on
`K − L'L'ᵀ` once; per case the shape and residual test of a linear bundle; per combination
`B_j − Σ|cᵢ|bᵢ ≥ 0` and `Σ_k (Σcᵢũᵢ[k] − ũ_j[k])² ≤ (B_j − Σ|cᵢ|bᵢ)²`; for the envelope
`E ≥ B_j` and `maxAbs[k] = max_j |ũ_j[k]|` exactly; per quantity
`Σ|cᵢ| b_{i,q} + |Σcᵢ v_{i,q} − v_{j,q}| ≤ B_{j,q} ≤ E_q`.

**Soundness (`verify/Certify/ComboSound.lean`).**
* `Certify.Combo.check_sound_disp`: for all right-hand sides `fᵢ` in the cases'
  enclosures, `‖K⁻¹fᵢ − ũᵢ‖₂ ≤ bᵢ` (`case_sound`, via `Certify.Bundle.check_sound`),
  `‖Σ cᵢ K⁻¹fᵢ − ũ_j‖₂ ≤ B_j`, and for every DOF `k` every exact
  `|(Σ cᵢ K⁻¹fᵢ)[k]|` is `≤ maxAbs[k] + E` and some is `≥ maxAbs[k] − E`
  (i.e. `|max_j |exact_j[k]| − maxAbs[k]| ≤ E`);
* `Certify.Combo.check_sound_quantities` (interval linear combination): if every exact case
  value is within its stated case bound, every exact combination `Σ cᵢ eᵢ` is within
  `B_{j,q}` of the reported combination value, and `B_{j,q} ≤ E_q`.

Displacements of combinations and the envelope are therefore checked end to end; for end
forces the per-case bounds (`forces.rs`, f64 evaluation of the force formulas) remain an
assumption and only the combination step is checked. Station (diagram) bounds are not in
the bundle.

### Provenance

Every bundle (linear `v2`, plastic, combination) carries

| field | meaning |
|---|---|
| `provenance.inputSha256` | SHA-256 of the *canonical JSON* of the solver input: the input as the engine parsed it (`SolverInput`, `PlasticInput`, `MultiCaseInput`, … ), serialized by `serde_json` through `serde_json::Value` (object keys sorted), compact (`certify::provenance::canonical_json`) |
| `provenance.inputKind` | the input type |
| `provenance.engineVersion`, `engineCommit` | `CARGO_PKG_VERSION` and the git commit the engine was built from (`engine/build.rs`; `STABILEO_GIT_COMMIT` overrides, `unknown` without git) |
| `provenance.kinds` | certificate kinds: `linear-static`; `plastic-collapse-static`, `plastic-collapse-kinematic`; `linear-static`, `load-combination`, `envelope`, `end-force-combination` |

`certcheck` prints the provenance with its verdict (and rejects an unknown `format` with a
clear message, exit 2). It does not hash: `verify/scripts/check-bundles.sh` checks that
`inputSha256` is the SHA-256 of the canonical input `NAME.input.json` shipped next to each
sample bundle `NAME.json`. The provenance is not covered by the soundness theorems: it ties
a checked bundle to an input, and a mismatch is caught by the script, not by Lean.

### Tests and samples

`engine/tests/certify_bundle.rs` writes to `target/cert-bundles/`:
* linear (`export_bundles`): `ex-3d-portal-frame`, `ex-3d-tower`, `ex-3d-nave-industrial`,
  with tampered copies `bound / 1024`, `ũ` moved by `4b` (then `‖u* − ũ'‖ ≥ 3b`), and
  `μ = 2 min Kᵢᵢ` (`> λ_min`, contradicting `check_sound_coercive`);
* plastic (`export_plastic_bundles`): a 2D portal (combined mechanism, `λ_c = 6Mp/7`), a
  2D continuous beam (hinges inside members), a 3D biaxial cantilever (`λ_c = 8`) and a 3D
  space portal under biaxial sway with a member load; tampered: static field and `λ_lo`
  scaled by 3/2 (equilibrium holds, yield fails, `1.5 λ_lo > λ_up`), `λ_up / 2`, `mpLo / 2`
  (the claim for the wider enclosure is false), a hinge rotation doubled (identity fails);
* combinations (`export_combination_bundles`): 2D frame (2 cases, 4 combinations incl. a
  negative factor), 2D 3-storey building, 3D building (n = 270, 4 cases); tampered: a
  combination bound `/ 1024`, a combination `ũ` moved by `4B`, an envelope value doubled,
  an end-force combination bound `/ 1024`;
* every bundle's canonical input `NAME.input.json`, and wrong-hash copies
  (`*.wronghash.json`: valid certificates whose recorded input hash is not that of the
  shipped input).

`verify/samples/` holds small committed copies of these (all three formats, positive and
negative), a `v1` linear bundle (no provenance; must still be accepted) and a bundle with
an unknown format (`*.badformat.json`; must be refused with exit 2). `verify/scripts/check-bundles.sh [--no-generate] [DIR...]` regenerates the
bundles (unless `--no-generate`), builds `certcheck` and checks the generated directory and
`samples/`: every `NAME.json` must be accepted *and* match its input hash, every
`*.tampered-*` must be rejected, and every `*.wronghash*` must be accepted by `certcheck`
but caught by the hash check. The ignored test `export_large_bundles` writes the generated
frame buildings above to `target/cert-bundles-large/`.

### What the Lean checker proves, and what remains trusted

The full list of assumptions per certificate kind (rounding model, interval code, f64
assembly, parsing, runtimes, Lean kernel) is [TRUSTED_BASE.md](TRUSTED_BASE.md).

| result | checked in Lean (theorem) | still trusted |
|---|---|---|
| linear static displacements | `‖K⁻¹f − ũ‖₂ ≤ b` for every `f` in the enclosure (`Bundle.check_sound`) | assembly of `K` and of the `f` enclosure from the input; the JSON reader |
| plastic collapse, 2D and 3D | `λ_lo ≤ λ_c ≤ λ_up` for the stated discretized problem and every `Mp` in the enclosures (`Plastic.check_sound`) | model building (rows, moment functionals, `Mp` enclosures from section data); the JSON reader |
| combinations / envelope, displacements | case bounds, combination bounds, max-abs envelope within `E` (`Combo.check_sound_disp`) | as for linear static |
| combinations / envelope, end forces | combination and envelope bounds follow from the case bounds (`Combo.check_sound_quantities`) | the per-case force bounds (`forces.rs`), as before |
| provenance | — (hash checked by `check-bundles.sh`) | the canonicalization and SHA-256 in the engine and the script's `sha256sum` |

Not in any bundle (trusted in Rust only, with their own Lean theorems for the mathematics
where listed above): buckling, modal, P-Delta, spectral, harmonic, time-history, member
force bounds themselves, station bounds, design checks.

## Buckling load-factor enclosure

Linear buckling solves `K φ = λ N φ` with `N = −K_G`. The stability matrix
`A(λ) = K − λN` is affine in λ, and the structure is *stable* at λ when `A(λ) ≻ 0`
(`xᵀA(λ)x > 0` for all `x ≠ 0`). The critical load factor is where positive
definiteness is first lost:

    λ_cr = sup { λ ≥ 0 : A(λ') ≻ 0 for all λ' ∈ [0, λ] }.

* **Lower bound (convexity).** `xᵀA(λ)x = xᵀKx − λ xᵀNx` is affine in λ, so if
  `A(0) ≻ 0` and `A(λ̲) ≻ 0` then `A(λ) ≻ 0` on all of `[0, λ̲]`, hence `λ_cr ≥ λ̲`.
  Both endpoints are certified with the Gram residual + Gershgorin check above
  (applied to the interval-enclosed entries of `K − λN`, `μ > 0`).
* **Upper bound (Rayleigh quotient).** For the computed mode `φ ≠ 0`, if
  `φᵀKφ ∈ Inum`, `φᵀNφ ∈ Iden`, `Iden.lo > 0` and `λ̄ ≥ max(0, Inum.hi / Iden.lo)`
  (rounded up), then `φᵀA(λ̄)φ ≤ 0`, so `A(λ̄)` is not positive definite and `λ_cr ≤ λ̄`.

A reported factor above the established upper bound is refused as `Uncertified`,
even if the excess is only round-off. The checker does not widen the enclosure to
include an inconsistent estimate. This consistency check does not change the
mathematical enclosure theorem.

The enclosure `λ̲ ≤ λ_cr ≤ λ̄` is about the f64 `K` and `K_G` as assembled (with `K_G`
built from the computed linear axial forces), not about rounding-free versions of them.

With constraints the solver solves the reduced pencil `(Cᵀ K C) φ_q = λ (Cᵀ N C) φ_q`.
The certificate is about that pencil with the f64 `K`, `N`, `C` entries taken as exact:
both reduced matrices are enclosed entrywise in interval arithmetic (as in "Constraints"
above), `A(λ) = CᵀKC − λ CᵀNC` is enclosed from those enclosures, and the lower and
upper bounds are certified exactly as above (the Rayleigh vector is the returned mode
read at the independent DOFs).

Lean: `Certify.buckling_enclosure` (`verify/Certify/Buckling.lean`), built on
`stable_segment`, `not_stable_of_interval_rayleigh` and `stable_of_gram`; the
corollary `Certify.buckling_criticalFactor_mem` states `λ_cr ∈ [λ̲, λ̄]` for
`criticalFactor K N := sSup {λ | 0 ≤ λ ∧ ∀ λ' ∈ [0, λ], Stable K N λ'}`.

## Modal enclosures and completeness

Free vibration solves `K φ = λ M φ` (`λ = ω²`) with `K ≻ 0` and `M ⪰ 0` (possibly
singular). `engine/src/certify/modal.rs` certifies three things.

* **Single-mode enclosure.** With `C = K^{-1/2} M K^{-1/2}` (symmetric, eigenvalues
  `ν = 1/λ`) and `y = K^{1/2}φ`, the residual `C y − ν̂ y = K^{-1/2} s`,
  `s = Mφ − ν̂ Kφ`. For a symmetric matrix some eigenvalue `ν` satisfies
  `|ν − ν̂| ≤ ‖C y − ν̂ y‖₂ / ‖y‖₂` (Bauer–Fike for normal matrices), and
  `‖K^{-1/2}s‖/‖y‖ ≤ ‖s‖ / √(σ_K · φᵀKφ)` with `σ_K` a certified lower bound on `λ_min(K)`.
* **At most `j` eigenvalues `λ ≤ μ`.** Stated without eigenvalues (min-max form): every
  subspace `S` on which `xᵀ(K − μM)x ≤ 0` has `dim S ≤ j`. If `A = K − μM` is positive
  on a subspace `V` then `S ∩ V = 0`, so `dim S + dim V ≤ n`. Two certified choices
  of `V`: the coordinate subspace `{x | xᵢ = 0, i ∈ I}` (a principal submatrix of `A`
  with `|I| = j` rows/columns deleted is positive definite, `dim V = n − |I|`), or
  `V = ker Uᵀ` when `A + c U Uᵀ ≻ 0` for some `U ∈ ℝ^{n×j}` (Finsler; checked by the
  Gram residual + Gershgorin certificate).
* **At least `j` eigenvalues `λ < μ`.** Kahan's block residual theorem (Frobenius
  form) applied to `Y = K^{1/2}Φ`, `R = CY − Y diag(ν̂)`: if `‖Yz‖² ≥ g‖z‖²` (`g > 0`)
  and `‖R‖_F ≤ r`, at least `j` eigenvalues of `C` (with multiplicity) lie in
  `⋃ᵢ [ν̂ᵢ − ρ, ν̂ᵢ + ρ]`, `ρ = r/√g`; in particular at least `j` are `≥ min ν̂ − ρ`.
  The Rust takes `r² = Σᵢ ‖sᵢ‖²/σ_K` (column `i` of `R` is `K^{-1/2}sᵢ`, so this bounds
  `‖R‖_F²`, not just `‖R‖₂²`) and `g` a Gershgorin lower bound on `λ_min(ΦᵀKΦ) =
  σ_min(Y)²`, i.e. exactly the proved constant. Then `ν ≥ min ν̂ − ρ > 0` gives
  `λ = 1/ν ≤ 1/(min ν̂ − ρ) < μ`. Proof: in eigen-coordinates `R̂ₖᵢ = (λₖ − ν̂ᵢ)Ŷₖᵢ`; if
  fewer than `j` eigenvalues qualify, some `z ≠ 0` has `Yz` orthogonal to their
  eigenvectors, and Cauchy–Schwarz gives `g‖z‖² ≤ ‖Yz‖² < (r²/ρ²)‖z‖² = g‖z‖²`.

With constraints the same three certificates are applied to the reduced pencil
`(Cᵀ K C, Cᵀ M C)` the solver solves (f64 sparse `K`, `M`, `C` taken as exact; both
reduced matrices enclosed entrywise in intervals, every use of their entries — `Kφ`,
`Mφ`, the Gram/Gershgorin and deleted-principal-submatrix checks, the dense Finsler
matrix — goes through those enclosures), with the computed modes read at the
independent DOFs.

Lean (`verify/Certify/Modal.lean`), with `NonposSubspace A S := ∀ x ∈ S, xᵀAx ≤ 0`:

* `count_le_of_pos_on` / `count_le_of_pos_on'`: `A` positive on `V \ 0` ⇒ every
  nonpositive `S` has `dim S + dim V ≤ n` (`dim S ≤ n − dim V`).
* `finrank_deletedSubspace`: `dim {x | xᵢ = 0, i ∈ I} = n − |I|`;
  `count_le_of_deleted`: `A` positive there ⇒ `dim S ≤ |I|`. (Positivity of the
  principal submatrix is taken as a hypothesis; its Gram/Gershgorin certificate is not
  connected in Lean.)
* `count_le_of_finsler`: `A + c U Uᵀ ≻ 0` ⇒ `dim S ≤ j`; `count_le_of_finsler_gram`:
  the same from an interval Gram-residual certificate of `K − μM + c U Uᵀ` (any real `L`,
  Gershgorin bound `> 0`).
* `exists_eigenvalue_near`: for real symmetric `C`, `y ≠ 0` and any `ν`, some
  `e = hC.eigenvalues k` has `|e − ν| ≤ ‖Cy − νy‖₂ / ‖y‖₂` (via the spectral theorem).
  The change of variables to the pencil (`K^{±1/2}`, `σ_K`) is not formalized.
* `kahan_count_of_sep` (`verify/Certify/Kahan.lean`): `C` symmetric, `Y : n × m`,
  `∀ z, g‖z‖² ≤ ‖Yz‖²` (`g > 0`), `Σᵢⱼ (CY − Y diag ν)ᵢⱼ² ≤ r²`; if every eigenvalue
  `λₖ` with `¬P k` has `r² < g(λₖ − νⱼ)²` for all `j`, then `m ≤ #{k | P k}`.
  Corollaries (`r ≥ 0`, `ρ = r/√g`): `kahan_union_count`, `m ≤ #{k | ∃ j, |λₖ − νⱼ| ≤ ρ}`;
  `kahan_lower_count`, with `νmin ≤ νⱼ` for all `j`, `m ≤ #{k | νmin − ρ ≤ λₖ}` (the
  form the Rust uses). As above, the pencil change of variables (`C = K^{-1/2}MK^{-1/2}`,
  `‖K^{-1/2}s‖² ≤ ‖s‖²/σ_K`, `ΦᵀKΦ = YᵀY`, Gershgorin for `g`) is not formalized.

## Member force bounds

Local member end forces are affine in the element end displacements,
`f = k_local · T · u_e − fef`, so forces at the exact `u*` and the computed `ũ` differ
by `k_local T (u* − ũ)`. By Cauchy–Schwarz, component `i` satisfies

    |(k T (u* − ũ))ᵢ| ≤ ‖row_i(k)‖₂ · ‖T‖₂ · ‖u* − ũ‖₂,

with `‖T‖₂ ≤ 1 + 4ε` (rotation with rounded entries) and `‖u* − ũ‖₂` from the
displacement certificate (`engine/src/certify/forces.rs`). Rounding in the f64 force
evaluation itself is not included.

Warping frames (14 DOFs per member in a 7-DOF-per-node model) use
`frame_local_stiffness_3d_warping` the same way; rows 6 and 13 give the bimoment bound.
With constraints or inclined supports the displacement bound fed in is the mapped one
of those sections (global axes), so the force bounds hold unchanged.

**Shell stress resultants.** For MITC4 quads, DKT plates and MITC9 quads the reported
centroid resultants `σxx, σyy, τxy, mx, my, mxy` (and MITC4 `qx, qy`) are linear in the
element's local displacements, `s = L T u_e` (thermal terms are constant and cancel in
the difference). The columns `L e_k` are obtained by running the solver's own recovery
(`quad_stresses`, `quad_transverse_shear`, `plate_stress_recovery`, `quad9_stresses`) on
unit vectors with zero thermal load, and each resultant gets
`‖row_i(L)‖₂ · ‖T‖₂ · ‖u* − ũ‖₂`. As for member forces, `L` is the map *as the f64
recovery evaluates it* (its entries carry the recovery's rounding) and rounding in
evaluating `s(ũ)` is not included. Von Mises and principal stresses are not linear and
get no bound; neither do solid shells or curved shells. Warping and shell bounds are
not yet formalized in Lean (they are instances of `force_bound` with a different `k`).

Lean (`verify/Certify/Forces.lean`): `abs_mulVec_sub_le` (`|(B(u − ũ))ᵢ| ≤
‖row_i B‖ ‖u − ũ‖`) and `force_bound`: if `‖row_i k‖ ≤ r`, `‖Tx‖ ≤ τ‖x‖` for all `x`
(`τ ≥ 0`) and `‖u − ũ‖ ≤ b`, then `|((kT)(u − ũ))ᵢ| ≤ r τ b`. The bound `‖T‖₂ ≤ 1 + 4ε`
is assumed, not proved.

## Load combinations and envelopes

`engine/src/certify/combinations.rs` (wasm: `certify_multi_case_2d/3d`). A combination
is `Σ cᵢ · (case i)`; its exact value is `Σ cᵢ u*ᵢ` — the exact solution for the combined
loads, since the reduced system is linear in `f` (prescribed displacements enter each
case's right-hand side and combine the same way).

* **Cases.** All cases share one stiffness, so its coercivity (σ from the dense interval
  Cholesky, or μ from the Gram + Gershgorin check) is certified once
  (`certify_load_cases_2d/3d`); each case then costs one interval residual, giving
  `‖u*ᵢ − ũᵢ‖₂ ≤ bᵢ`. `certify_results_2d/3d` are the one-case special case.
* **Combination displacements.** `‖Σcᵢu*ᵢ − ũ_c‖₂ ≤ Σ|cᵢ|bᵢ + ‖Σcᵢũᵢ − ũ_c‖₂`. The
  second term is the f64 rounding of the combination itself: `Σcᵢũᵢ` is enclosed in
  interval arithmetic and compared with the *reported* `ũ_c`, so a misreported
  combination is caught (the bound grows to cover it). All sums are rounded up.
  Factors that are exactly 0 are skipped; any uncertified case with a non-zero factor
  makes the combination uncertified.
* **Combination member forces.** End forces are affine in `u` with load terms that do
  not depend on `u` (`f = k T u − fef`), so `|F_c* − F̃_c| ≤ Σ|cᵢ|ΔFᵢ + |Σcᵢ F̃ᵢ − F̃_c|`
  per component, with `ΔFᵢ` from the member force bounds below.
* **Diagram stations.** Each case's diagram bound (next section, valid at every x)
  combines the same way, `Σ|cᵢ|·Sᵢ`, plus the rounding of the combined start forces the
  diagram formula reads (`δM + L·δV` for moments, `δN`, `δV`, `δT` otherwise). These are
  the `stationBounds`; they replace the former `ΔM + ΔV·L`, which is several times looser.
  Combinations also carry the gaps of their computed diagrams, `deflectionBounds` (member
  factor × the combination's displacement bound) and `reactionBounds` (`Σ|cᵢ|Rᵢ` plus the
  rounding of the combined reaction against the reported one).
* **Envelopes.** `max_k`, `min_k` and max-abs over combinations are 1-Lipschitz in the
  sup norm, so every envelope value (max-abs results, envelope diagram ordinates) is
  within the largest combination bound of the exact envelope. The envelope is
  certified only if every combination is, and only for members bounded in every
  combination. Max-abs displacements are bounded in magnitude (the sign may flip on a
  tie).

Not included (inherited from the member force bounds): f64 rounding in each case's
force formulas and in evaluating the diagram polynomials. Constraints and inclined
supports are unsupported, as for single cases. Envelope curves get no gaps: their
station values are certified, not the envelope between stations.

## Diagrams, extremes, deflections and reactions

What the result views compute after the solve (`engine/src/certify/stations.rs`,
`deflection.rs`, `reactions.rs`; attached to `certify_linear_2d/3d`, to every case and
combination of `certify_multi_case_2d/3d` and to the envelope as `stationBounds`,
`deflectionBounds`, `reactionBounds`, `reactionReason`). Tests:
`engine/tests/certify_shown.rs`.

* **Diagrams at every x.** The evaluators (`postprocess::diagrams::compute_diagram_value_at`,
  `diagrams_3d::evaluate_diagram_3d_at` and their TypeScript twins `computeDiagramValueAt`,
  `evaluateDiagramAt`) compute `M(x) = M_start − V_start·x + (loads)`, `V(x) = V_start + …`,
  `N(x) = N_start + …` (TS: `(1−t)N_start + t(N_end + Σpx) − …`), 3D `M_z = M_z,start −
  V_y,start·x + …`, `M_y = M_y,start + V_z,start·x + …`, `T = (1−t)T_start + t·T_end`. The load
  terms do not depend on `u` and the end forces are rows of `k_local T u_e`, so the error is
  `r(x)·T·Δu_e` with `r(x)` affine in x (or a convex combination of two rows) and
  `|r(x)TΔu| ≤ ‖r(x)‖₂·‖T‖₂·‖u* − ũ‖₂`. `x ↦ ‖r(x)‖₂` is convex: its sup over `[0, L]` is at
  `x = 0` or `x = L`, evaluated in interval arithmetic. The bound therefore holds at *every*
  point of the member (the hover, any polyline between stations) and for both evaluators,
  which share the u-dependence exactly; the TS–engine agreement of the load terms is a
  vitest (`certificate-shown.test.ts`).
* **Extremes.** max, min and max-abs over a fixed set of stations are 1-Lipschitz in the sup
  norm: the station bound bounds the error of every displayed extreme. Between stations the
  *computed* diagram can exceed its station extreme; `gaps` bound by how much over the
  engine's stations (`diagram_positions_2d/3d`, which the TS diagrams use too):
  `G_k = K·h²/8 + Σ|S_i|·min(c_i − x_k, x_{k+1} − c_i, h/4) + min(Σ|J_i|, D·h)` on each station
  interval, with `K ≥ |f''|` on smooth pieces (`|q|` for moments, `|q'|` for shears), `S_i` the
  slope jumps (point loads in M, load ends in V), `J_i` the value jumps (couples in M, point
  loads in V) and `D ≥ |f'|` (proof in `stations.rs`). So the exact extreme along the member
  lies in `[shown − bound, shown + bound + gap]`; the max label prints `±(bound + gap)`. Where
  the extreme occurs is **not** certified: the argmax is not continuous in the forces (two
  near-equal peaks can swap).
* **Deflection curves.** `compute_deformed_shape` (and TS `computeDisplacementAt`,
  `memberLocalCurve`, the same Euler–Bernoulli/Timoshenko member) is `u(x) = (1−t)u_i + t u_j`
  and `v(x) = Σ p_k(x) q_k + (loads)` per bending plane, `q = (v_i, θ_i, v_j, θ_j)`. The cubics
  `p_k` are probed from the solver's own `MemberDeflection` (`deflection_shape_cubics`) and the
  three parts use disjoint end components, so every displayed translation (and the length of
  the displacement) at every x is within `√max(1, S)·‖T‖²·‖u* − ũ‖₂`, `S = sup ‖p(x)‖₂²`
  enclosed by interval Horner on 64 subintervals (max over Euler–Bernoulli and, with a shear
  area, Timoshenko; trusses as straight lines). Rotations along the curve are not bounded.
* **Reactions.** Restrained DOF: `R = (K u − f)_d`, so `|ΔR| ≤ ‖K_{d,F}‖₂·‖u* − ũ‖₂`; spring
  DOF: `R = −k u_d`, `|k|·‖u* − ũ‖₂`. The reported value is also compared with the formula
  at ũ in interval arithmetic and the difference added, so the reaction bound covers the
  f64 evaluation and any mismatch with the formula. Not bounded (with `reactionReason`):
  constraints, inclined supports; skipped: 2D springs with an angle, nodes with several
  supports, the bimoment reaction.

Tests: the double-double reference of the same assembled system lies inside every bound on
84 certified random models (≈170 000 checks; the reference reaches 41% of a bound) and on
feature models (partial and trapezoidal loads, couples, thermal loads, hinges, trusses,
Timoshenko, springs, 3D releases, axial distributed loads); the worst displacement-error
direction allowed by the certificate, probed through the solver's own routines, reaches
≥ 0.9999 of every bound kind (so halving any bound fails); gaps are attained (ratio > 0.99)
by diagrams peaking midway between stations; combinations contain the combined reference.

Inherited limitation: rounding in the f64 evaluation of the diagram and curve formulas is
not included (reactions excepted, see above). Not yet formalized in Lean (instances of
`force_bound` with `r(x)` for `k`, plus the convexity and chord-error lemmas).

## Certified design checks

`engine/src/certify/design.rs`, `engine/src/certify/real.rs`. A utilization ratio is a
function of the design forces; given certified enclosures `[F − ΔF, F + ΔF]` (from the
member force / combination station bounds above) the code formulas are evaluated in
outward-rounded interval arithmetic, so `[lower, upper]` contains the exact real
utilization for *every* force in the box. `certifiedOk = upper < 1` certifies the member
passes; `certifiedFail = lower > 1` certifies it fails; otherwise the result is
inconclusive at this precision.

* **One implementation.** The formulas are written once, generic over a small trait
  `Real` implemented for `f64` (the ordinary check) and `Interval`. Data enter as
  `T::exact`, decimal code constants (0.877, 4.71, φ factors …) as `T::lit` (the
  interval version widens by one ulp each way, enclosing the real decimal constant), π
  as a one-ulp enclosure. A test checks the two instantiations agree on point inputs
  (enclosure contains the f64 value, width ≤ 1e-12 relative) over thousands of random
  members, so they cannot drift.
* **Branches.** Comparisons return `True / False / Unknown`. `branch(c, a, b)` evaluates
  one arm when decided and the hull of both when the box straddles the condition
  (e.g. AISC H1-1a/H1-1b at `Pr/Pc = 0.2`, which is discontinuous; E3 inelastic/elastic;
  F2 plastic/inelastic/elastic LTB). `min`, `max`, `abs` are exact on intervals.
* **Transcendentals.** `x^y` (AISC E3-2 `0.658^(Fy/Fe)`, EC2 `(100ρ fck)^(1/3)`, `k^1.5`)
  is evaluated at the corners of the box (monotone in each argument for `x > 0`) and
  widened by 8 ulps relative plus the smallest normal; `tan` (EC2 strut angle) likewise
  on `(−1.57, 1.57)`, refusing outside. This **assumes the platform libm `pow`/`tan` are
  accurate to 8 ulps** (mainstream libms are within 1–2). `sqrt` is correctly rounded by
  IEEE 754. An exponent written `1.0/3.0` is enclosed as the interval quotient, which
  contains the real 1/3.
* **Refusal.** A demand whose value or bound is non-finite or negative, a capacity not
  certified positive where a demand exists, or any non-finite enclosure makes the
  member `certified: false` with a reason — never a ratio.
* **Members over all demand points.** A member is certified over every demand set given
  for it (max over sets of the per-set enclosures). `steel_demands_from_combinations_*`
  supplies N, M, V (3D: N, M_y, M_z, V_y) at evenly spaced stations (default 21, as the
  envelope diagrams) of every combination with that combination's station bounds;
  an uncertified combination is an error and a member missing a bound in some
  combination is refused. Values *between* stations are not covered (as in the f64
  envelope).

* **Roots (RC flexure).** CIRSOC 201 and ACI 318 flexure solve strain compatibility
  (`postprocess/rc_flexure.rs`): the neutral axis `c` is the root of the force residual
  `R(c) = Cc(c) + As'·fs'(c) − As·fs(c)`, with both steel stresses clamped to `±fy`.
  `R` is continuous and strictly increasing for `c > 0` on the data domain checked by
  `RcFlexureSection::monotone` (f'c, bw > 0, bf ≥ bw, hf, As, As', Es, d, d', fy ≥ 0;
  otherwise the member is refused), so the root is unique. `Real::increasing_root`
  bisects in f64 and the interval instantiation certifies a bracket `[r − δ, r + δ]`
  around the f64 root by evaluating `R` in interval arithmetic at both ends (`< 0` left,
  `> 0` right for every real parameter in its enclosure); `Mn`, `εt` and `φ` are then
  evaluated over the bracket. Capacities depend only on the exact member data.
* **P-M interaction (ACI).** With `Nu ≠ 0` the f64 check bisects to *a* neutral axis
  where `φPn(c) = Pu` (`φPn` need not be monotonic). The certified check encloses `φMn`
  over the whole set `{c : φPn(c) ∈ [Pu]}` by branch and bound on `c`: boxes whose
  `φPn` enclosure misses `[Pu]` are dropped, the rest split down to a relative width of
  1e-12 (or 1e-4 for boxes entirely inside `[Pu]`), at most 200 000 boxes. This contains
  whichever crossing the f64 bisection finds. `[Pu]` must be certified strictly inside
  `(φPn(c_min), φPn(c_max)]` (off the diagram the f64 check flags the flexure check), and
  an `Nu` box containing 0 and non-zero values takes the hull of the pure-flexure and
  diagram strengths (the f64 check switches at exactly `Nu = 0`). A T-beam with a
  possibly non-zero `Nu` is refused (the f64 check flags it incomplete).

* **CIRSOC 301** (`postprocess/cirsoc301_check.rs`): D.2, E (E.3, E.4, E.5, E.6, E.7), F.2–F.6,
  G.2/G.4 and H.1, the capacities generic over `Real`. A check refused under load refuses the box.
  A check that runs only for some demands (tension or compression, weak-axis flexure above
  1e-6 kN·m, interaction) counts toward the upper bound wherever it may run and toward the lower
  bound only where it certainly runs. The least root of the asymmetric-section cubic E.4.6 (unequal
  angles) is certified by `increasing_root` on (0, min(Fex, Fey, Fez)): Courant–Fischer on the
  definite pencil puts exactly one root there. Classification thresholds of Tabla B.4.1 are
  decided on the f64 data, as in the AISC check.

Wasm: `certify_steel_members`, `certify_ec3_members`, `certify_ec2_members`,
`certify_cirsoc201_members`, `certify_cirsoc301_members`, `certify_rc_members`, `certify_timber_members`,
`certify_cfs_members` (bounded demands in; `ec3_demands` / `ec2_demands` /
`cirsoc201_demands` / `rc_demands` / `timber_demands` / `cfs_demands` convert the station demand sets and
`scale_demands` changes units, e.g. kN → N for EC2's Pa-based formulas, widening each
bound by the scaling's rounding), `certify_steel_multi_case_2d/3d`
(multi-case model + members in, `{ analysis, steel }` out).

| Check | Status |
|---|---|
| AISC 360 (`steel_check`): tension D2 (yield + rupture), compression E3, flexure F2 (LTB) / F6, shear G2, interaction H1 | **certified** |
| EC3 (`ec3_check`): tension 6.2.3, flexural buckling 6.3.1 (χ curves a–d), LTB 6.3.2, weak-axis flexure 6.2.5, shear 6.2.6, interaction 6.3.3 (6.61)/(6.62) with Annex B factors | **certified** |
| EC2 (`ec2_check`): RC flexure 6.1 (rectangular block, singly / doubly reinforced, compression-steel yield branch), shear 6.2 (VRd,c with the NEd axial term over the whole NEd interval, VRd,s, VRd,max) | **certified** |
| CIRSOC 201 (`cirsoc201_check`): RC flexure 10.2 (strain compatibility, singly / doubly reinforced, compression- and tension-steel yield branches, φ 9.3.2 with εty = 0.002 for fy ≤ 420 MPa else fy/Es), shear Cap. 11 (Vc with √f'c ≤ 25/3, Vs, Vs,max) | **certified** |
| ACI 318-19 (`rc_check`): RC flexure 22.2 (strain compatibility, rectangular singly / doubly, T-beam flange / web), P-M interaction 22.4 at the axial load, axial capacity 22.4.2.1 / 22.4.3.1, φ Table 21.2.2, shear 22.5.5.1 (Av,min switch, λs, √f'c ≤ 8.3, Vs,max) | **certified** |
| NDS timber (`timber_check`): bending 3.3 (CL with the Table 3.3.3 effective span), compression 3.6 (CP), tension 3.8, shear 3.4, interaction 3.9.1 / 3.9.2 (FcE1 amplification, saturated at 99) | **certified** |
| AISI S100 (`cfs_check`): compression E2 (weak-axis flexural buckling, local via Ae) / E4 distortional, tension D2, flexure F2.1 LTB / F4 distortional, weak-axis flexure, web shear G2.1 (three ranges), linear interaction H1.2 / H2 | **certified** |
| CIRSOC 301 (`cirsoc301_check`): tension D.2, compression E.3–E.7, flexure F.2–F.6, shear G.2/G.4, interaction H.1 (see the bullet above) | **certified** |
| masonry, connections, foundations, serviceability | not certified (f64 only) |

Timber note: past buckling (`fc ≥ FcE1`) the f64 check saturates the 3.9.2 ratio at 99;
the amplified term is written `fb/max(1 − fc/FcE1, fb/99)` (equal after the final
`min(·, 99)`, and finite), so a box reaching `FcE1` has an enclosure reaching 99. A box
that also contains a zero moment is refused (the term jumps 0 → 99 there).

CFS note: flexural-torsional buckling of singly symmetric sections and second-order
amplification are not in the f64 check (the web flags the former). Fixed while
certifying (regression tests in `tests/integration/cfs_check.rs`): zero / non-finite
capacities passed (now `unevaluated`), F2.1 read `1 + √X` for `√(1 + X)` (Me high; the
web's compensating Cw rescaling in `cfs-code.ts` is removed), G2.1 used the yield branch
up to the elastic limit, a misprinted inelastic limit and an elastic Vn missing a factor
t, a shear demand without web geometry read ratio 0, and the interaction used AISC's
H1-1a/b split instead of AISI's linear sum.

EC3 note: an unbraced length `lb = 0` gives `Mcr = x/0`; the f64 check reads it as no
LTB reduction, the interval check refuses (division by an interval containing 0).

RC model notes (the f64 check's model, which is what is certified): the displaced
concrete at the compression bars is not deducted in pure flexure (it is in the ACI
interaction diagram); the T-beam ignores compression steel; CIRSOC 201 has no axial
force. Fixed while certifying (regression tests in `tests/integration/cirsoc201_check.rs`
and `rc_check.rs`): CIRSOC 201 passed a member with zero capacity, assumed the tension
steel yields when εt < εy, took the compression-steel stress from the singly reinforced
neutral axis, used εty = 0.002 for every grade and left √f'c uncapped in Vc; ACI had no
axial capacity check (an overloaded column reported the moment at the end of the
diagram), dropped the axial force on T-beams, assumed the tension steel yields, and left
√f'c uncapped in Vc.

Inherited limitations: rounding in the f64 evaluation of member forces and diagram
polynomials (see member force bounds) is not included; capacities are certified as the
real-number value of the code formula for the given section data.

## P-Delta (second-order) displacements

`engine/src/certify/pdelta.rs` (wasm: `certify_pdelta_2d/3d`).

**Model.** The P-Delta solver iterates `(K + K_G(u)) u = f`, the geometric stiffness
built from axial forces read back from the displacements. Element by element
(`KgAffineTerm`, `geometric_stiffness_terms_{2d,3d}`):

    K_G(u) = Σ_e N_e(u) G_e,    N_e(u) = e·a·(t_eᵀu / l − α·ΔT),

with `G_e` the element's global geometric stiffness at unit axial force computed by the
same element routine the solver uses (frames: Przemieniecki, 3D condensed for end
releases; trusses/cables: string stiffness), `t_e` the elongation coefficients (entries of
the element's transformation), and `e`, `a`, `l`, `α`, `ΔT` the f64 element data. The
certified model takes these f64 values, the sparse triplet-assembled `K` (full, free DOFs
first) and the assembled `f` as exact; the solver's own f64 `K_G(ũ)` equals `Σ N_e G_e`
only up to rounding, which does not matter because `ũ` is only a candidate. (The small
dense path, `n_total < 64`, iterates on the dense assembly, which differs from the
triplet one by rounding.) Restrained DOFs keep their returned (prescribed) values `u_R`.
Constraints and inclined supports are refused.

The free equations `F(x) = [(K + K_G(u))u − f]_F`, `u = [x; u_R]`, are *exactly quadratic*:
with `c_e = e·a/l` and `x = ũ + δ`,

    F(ũ + δ) = F(ũ) + J δ + q(δ, δ),
    J = (K + K_G(ũ))_FF + Σ_e c_e (G_e ũ)_F t_eᵀ,     q(x, y) = Σ_e c_e (t_eᵀx)(G_e y)_F,

because `K_G` is affine in `u` (`K_G(ũ + δ) = K_G(ũ) + Σ c_e (t_eᵀδ) G_e`). `J` is not
symmetric.

**Bounds.**

* `‖q(x, y)‖₂ ≤ β‖x‖₂‖y‖₂` with `β = max_d Σ_{e ∋ d} w_e`, `w_e = |c_e|·‖t_e‖₂·‖G_e‖_F`
  (restricted to free DOFs). Proof: `‖q(x,y)‖ ≤ Σ_e w_e ‖x_e‖‖y_e‖ ≤ (Σ w_e‖x_e‖²)^{½}
  (Σ w_e‖y_e‖²)^{½}` (Cauchy–Schwarz) and `Σ_e w_e‖x_e‖² = Σ_d x_d² Σ_{e∋d} w_e ≤ β‖x‖²`.
* `xᵀJx ≥ μ‖x‖²`: `sym(J)` (same sparsity as `K`: each `c_e g_e t_eᵀ` lives on the
  element's DOFs) is enclosed entrywise in intervals and certified by the Gram residual +
  Gershgorin check. Then `‖Jx‖ ≥ μ‖x‖`, `J` is invertible and `‖J⁻¹‖₂ ≤ 1/μ`.
* `‖J⁻¹F(ũ)‖₂ ≤ η := ‖d‖₂ + ‖F(ũ) − J d‖₂ / μ` for *any* vector `d` (an f64 Newton
  step: Cholesky of `sym(J)` plus refinement with `J`; never trusted), since
  `J⁻¹F = d + J⁻¹(F − Jd)`. `F(ũ)` and `J d` are evaluated in interval arithmetic.

**Lemma (Newton–Kantorovich for a quadratic map).** Let `F(ũ + δ) = F(ũ) + Jδ + q(δ,δ)`
with `q` bilinear, `J` invertible, `‖J⁻¹F(ũ)‖ ≤ η`, `‖J⁻¹q(x,y)‖ ≤ γ‖x‖‖y‖`. If
`4γη < 1`, then `F` has exactly one zero `u*` in the open ball `‖u − ũ‖ < 1/(2γ)`, and
`‖u* − ũ‖ ≤ r := 2η / (1 + √(1 − 4γη))` (the smaller root of `γr² − r + η = 0`).

*Proof.* Zeros of `F(ũ + ·)` are the fixed points of `T(δ) = −J⁻¹F(ũ) − J⁻¹q(δ,δ)`. On
`B_s = {‖δ‖ ≤ s}`: `‖T(δ)‖ ≤ η + γs² ≤ s` for `s ∈ [r, r₊]`, and since
`q(δ,δ) − q(δ',δ') = q(δ − δ', δ) + q(δ', δ − δ')`, `‖T(δ) − T(δ')‖ ≤ 2γs‖δ − δ'‖`, a
contraction for `s < 1/(2γ)`. With `4γη < 1`, `r < 1/(2γ)`, so Banach's theorem on
`B_r` gives existence of a zero with `‖δ‖ ≤ r`; for any `s ∈ [r, 1/(2γ))` it is the only
one in `B_s`, hence the only one with `‖δ‖ < 1/(2γ)`. ∎

Applied with `γ = β/μ` (`‖J⁻¹q(x,y)‖ ≤ ‖q(x,y)‖/μ`). The Rust validates the root
instead of trusting the formula: `r` is computed rounded up and accepted only if
`η + γr² ≤ r` and `2γr < 1` hold with directed rounding; `uniqueness_radius = 1/(2γ)`
rounded down. With `β = 0` (no axial-force-dependent terms) it reduces to the linear
bound `η`.

**Stability of the exact state.** If `λ_min(sym(K + K_G(ũ))_FF) ≥ μ_A` (Gram +
Gershgorin), then `λ_min(sym(K + K_G(u*))) ≥ μ_A − βr`, because
`|xᵀ(K_G(u*) − K_G(ũ))x| = |Σ_e c_e(t_eᵀδ) x_eᵀG_e x_e| ≤ ‖δ‖ Σ_e w_e ‖x_e‖² ≤ βr‖x‖²`.
When positive it is reported as `stabilityMargin`: the exact second-order state is
stable (`K + K_G(u*) ≻ 0`), independently of the solver's Cholesky/LU path.

**Output.** `absBound = r` on `‖u*_F − ũ_F‖₂`, `relBound`, `uniquenessRadius`, `mu`,
`beta`, `residualNorm` (`≥ ‖F(ũ)‖₂`), `newtonStep` (`η`), `stabilityMargin`. The
solver's iteration count does not matter: an iteration-limited answer is certified with
a bound on its distance to the true fixed point (tests: 2 iterations at 0.8·P_cr, true
error 2.24e-8, bound 2.26e-8). Past the critical load the reversed-sway LU answer is
never certified stable. Uncertified when `sym(J)` is not certified positive definite
(e.g. a candidate near an unstable equilibrium) or `4γη < 1` fails (candidate too far
for the curvature bound).

Honesty test (`tests/certify_nonlinear.rs`): the exact fixed point of the same model by
Newton's method with double-double residuals. Not formalized in Lean.

## Response spectrum (SRSS / CQC)

`engine/src/certify/spectral.rs` (wasm: `certify_spectral_2d/3d`).

**What is certified.** The spectral response, combined by the solver's rule (SRSS, or
CQC with the solver's correlation coefficients), of the **exact lowest `m` modes** of the
pencil `(K, M)` — `m` the number of modes in the input — with the spectrum evaluated at
the exact periods. `K` and `M` are the f64 sparse assemblies (as in "Modal enclosures"),
`Mr` the solver's ground-motion load `(M·r)_f` — the full mass times the unit translation
of every node in the direction, supports included, kept on the free rows (with a consistent
mass the free DOFs carry the inertia coupled to the moving supports, `M_fr·r_r`) — `Sa(T)` the
piecewise-linear interpolation of the spectrum points (constant beyond the ends), times
`9.81` (when in g, the f64 constant) `× I / R` (exact real quotient). Nothing the input
says about ω, periods, participation factors or effective masses is trusted; the mode
shapes and ω are candidates. Mass-participation truncation is not accounted for: the
certificate is for the response of exactly the lowest `m` modes (that they *are* the
lowest `m`, with none missing, is part of the certificate). Constraints, inclined
supports, curved beams and warping DOFs are refused.

**Modal response through the eigenprojector.** With `C = K^{-1/2}MK^{-1/2}` (eigenvalues
`ν = 1/λ`), `y = K^{1/2}φ` and `b = K^{-1/2}Mr`, for an exact simple eigenpair

    u_i* = φ (φᵀMr)/(φᵀMφ) · Sa(Tᵢ)/ωᵢ² = K^{-1/2} Πᵢ b · Sa(Tᵢ),     Πᵢ = yyᵀ/‖y‖²

(`φᵀMφ = νᵢ‖y‖²`, `λᵢνᵢ = 1`), independent of the normalization and sign of `φ`. For the
computed `φ̃` (projector `Π̃` of `ỹ = K^{1/2}φ̃`), `K^{-1/2}Π̃b = φ̃ (φ̃ᵀMr)/(φ̃ᵀKφ̃)`, so

    ‖u_i* − αᵢ φ̃‖₂ ≤ eᵢ := sinθᵢ · ‖Mr‖₂ · |Sa(Tᵢ)| / σ_K,    αᵢ = (φ̃ᵀMr)/(φ̃ᵀKφ̃) · Sa(Tᵢ),

using `‖K^{-1/2}‖₂ ≤ σ_K^{-1/2}`, `‖b‖₂ ≤ ‖Mr‖₂ σ_K^{-1/2}`, `‖Πᵢ − Π̃‖₂ = sinθᵢ`
(rank-one orthogonal projectors). `αᵢ` is an interval (`Sa` over the period enclosure).

**Isolation and eigenvector error (Davis–Kahan, single vector).** The modes are sorted by
ω̃² (strictly increasing; repeated frequencies are refused — the modal response of a
multiple eigenvalue depends on the basis, so the SRSS/CQC of "the exact modes" is not
defined). Cutoffs `0 = μ₀ < μ₁ < … < μ_m` are placed in the gaps (midpoint in ν; the
last one at `(1 + t)λ̃_m`, the largest `t ∈ {0.5, …, 0.001}` that certifies) and at each
`μ_j` the two completeness certificates of "Modal enclosures" give `#{λ < μ_j} ≥ j` and
`#{λ ≤ μ_j} ≤ j`. Hence exactly one eigenvalue `λ_j` (simple) lies in `(μ_{j−1}, μ_j)`
and every other eigenvalue `ν_k` of `C` (including the `ν = 0` of a singular `M`) is
`≥ 1/μ_{j−1}` or `≤ 1/μ_j`. With `ρⱼ ≥ ‖Cỹ − ν̂ỹ‖/‖ỹ‖` (as in the single-mode
enclosure) and `δⱼ = min(1/μ_{j−1} − ν̂, ν̂ − 1/μ_j)`:

    sinθⱼ ≤ min(1, ρⱼ / δⱼ).

*Proof.* Write the unit `ỹ = c y + s z`, `y` the eigenvector, `z ⊥ y` unit. Projecting the
residual onto `y^⊥` (which `C` leaves invariant) gives `s(C − ν̂)z`, and
`‖(C − ν̂)z‖ ≥ δ` because `z` lies in the span of the other eigenvectors. So
`|s|δ ≤ ‖Cỹ − ν̂ỹ‖ ≤ ρ`. ∎ The eigenvalue enclosure is the bracket, tightened by the
Bauer–Fike ball `[ν̂ − ρ, ν̂ + ρ]` when that ball lies inside the bracket's ν-range (then
the eigenvalue it contains is `λ_j`).

**Spectrum on period intervals.** `Tⱼ = 2π/√λⱼ ∈ [T_lo, T_hi]` (π enclosed by one ulp).
Since `Sa` is continuous and piecewise linear, its range over `[T_lo, T_hi]` is the hull
of its values at `T_lo`, `T_hi` (interval-evaluated interpolation) and at the breakpoints
inside; the spectrum periods must be finite and strictly increasing (else refused).

**Combination.** Per free DOF, `u_ik* ∈ αᵢφ̃_k + [−eᵢ, eᵢ]`; SRSS `√(Σᵢ u_ik²)` and CQC
`√|Σᵢⱼ u_ik ρᵢⱼ u_jk|` are evaluated in interval arithmetic, with
`ρᵢⱼ = 8ξ²(1+r)r^{3/2} / ((1−r²)² + 4ξ²r(1+r)²)`, `r = ωⱼ/ωᵢ` over the ω enclosures
(`ρᵢᵢ = 1` exactly; refused if a denominator enclosure contains 0).

* **Member forces**: per mode the solver's force recovery at `ũᵢ = mid(αᵢ)φ̃`, the error
  bound `bᵢ = eᵢ + ‖αᵢφ̃ − ũᵢ‖` fed to the member force bounds (the bound of each component
  holds at both ends), then SRSS/CQC in intervals of each end's **signed** value, and the
  envelope of the two ends after combining — as the solver does. (Both used to combine the
  per-mode `max(|start|, |end|)`, which made every CQC cross term non-negative.) As for member force bounds, rounding in the
  f64 force recovery is not included. The recovery is from the modal displacements
  alone, with no element loads: static member loads in the model (distributed, point,
  thermal) are not part of any mode's response, so their fixed-end forces enter neither
  the solver's modal forces nor the certified ones. (Before this was fixed the solver's
  modal recovery added those fixed-end forces to every mode, and SRSS/CQC combined them
  as if dynamic; `validation_spectral_element_loads_do_not_leak` and its 3D twin pin the
  loaded and unloaded models to the same spectral member forces.)
* **Base shear**, combined by the requested rule like every other quantity (it used to be
  SRSS whatever the rule, in the solver and here): `meffᵢ* = λᵢ‖Πᵢb‖²` with
  `‖Πᵢb‖ ∈ |φ̃ᵀMr|/√(φ̃ᵀKφ̃) ± sinθᵢ‖Mr‖/√σ_K`, times `Sa(Tᵢ)`, SRSS or CQC in intervals.

**Output.** Per mode: ω², period and `Sa` enclosures, `sinθ`, `eᵢ`; per node and member
the enclosures of the combined values; the base-shear enclosure; bounds on
`|exact − reported|` (max over displacement components, over force components, and for
the base shear) and whether every reported value lies inside its enclosure. A wrong
participation factor or ω in the input, or a tampered result, shows up as
`reportedWithin = false` (the enclosures do not use them); a missing mode makes the
isolation fail (`Uncertified`).

Honesty test (`tests/certify_nonlinear.rs`): an independent dense reference (Cholesky of
`K`, cyclic Jacobi on `L⁻¹ML⁻ᵀ`) of the exact modal response, combined in f64; the
reference lies inside every enclosure (to 1e-14 relative, its own accuracy). Not
formalized in Lean.

## Harmonic (steady-state) response

`engine/src/certify/harmonic.rs` (wasm: `certify_harmonic_2d/3d`).

**Model.** At each reported frequency, `ω` is the solver's f64 `2π·f` (a mismatch with
the reported `omega` is refused) and the exact steady state solves

    A u = f,    A = K_d + iωC,    K_d = K − ω²M,    C = a₀M + a₁K,

with `K`, `M` the f64 sparse assemblies on the free DOFs, `f` the assembled load, and
`(a₀, a₁)` the Rayleigh coefficients the solver derived (returned by
`solve_harmonic_{2d,3d}_with_damping`; reported in the certificate). This is the full
(untruncated) Rayleigh-damped system; the solver's modal superposition with a filtered
set of modes plus a static correction of the omitted ones (below) is one approximation of
it. Constraints and inclined supports are refused.

**Lemma (rotated coercivity).** For `s ≥ 0` let `B(s) = K_d + sωC =
(1 + sωa₁)K − (ω² − sωa₀)M` (real symmetric). If `λ_min(B(s)) ≥ μ_s > 0` then for every
complex `x`, `‖Ax‖₂ ≥ μ‖x‖₂` with `μ = μ_s/√(1 + s²)`; so `A` is invertible and for any
`ũ`, `‖u* − ũ‖₂ ≤ ‖f − Aũ‖₂/μ`.

*Proof.* `K`, `M` are real symmetric, so `a = xᴴK_dx` and `c = xᴴCx` are real and
`xᴴAx = a + iωc`. Then `Re((1 − is)xᴴAx) = a + sωc = xᴴB(s)x`, and for `x = p + iq`,
`xᴴB(s)x = pᵀBp + qᵀBq ≥ μ_s‖x‖²`. Hence `√(1+s²)·‖x‖‖Ax‖ ≥ |1 − is|·|xᴴAx| ≥ μ_s‖x‖²`. ∎

`s = 0` is plain coercivity of `K − ω²M` (below the first resonance). Above it, damping
supplies it: in modal terms `B(s) ≻ 0` iff `s > (ω² − λⱼ)/(2ξⱼωⱼω)` for every mode
below `ω`, so with `C ≻ 0` (`a₁ > 0`) some `s` always works at any `ω` — including at
resonance. `B(s)` is enclosed entrywise (`1 + sωa₁` and `ω² − sωa₀` in intervals) and
certified with the Gram residual + Gershgorin check on the real n×n matrix; no 2n×2n
system and no normal equations `AᴴA` are formed, so there is no size cap. `s` is tried
from `{previous point's s, 0, 0.1, 0.3, 1, …, 10⁵}`; soundness does not depend on it.
An undamped system above its first resonance (`C = 0`, `K_d` indefinite) is refused: its
invertibility would need a σ_min certificate of an indefinite matrix, not implemented.

**Candidate and residual.** The solver reports only the target DOF, so the certificate
computes its own full `ũ`: with `H = B(s)` (sparse Cholesky) and `G = ωC − sK_d`,
`(1 − is)A = H + iG`; CG in the H-inner product on `(I + W²)u = (I − iW)H⁻¹(1 − is)f`,
`W = H⁻¹G` (`I + W²` is H-self-adjoint, `⪰ I`), plus two steps of refinement. Nothing
about it is trusted: `r = f − Aũ` (real and imaginary parts) is enclosed in interval
arithmetic and `absBound = ‖r‖₂/μ` rounded up.

**Output.** Per frequency: `absBound` (whole free vector), `mu`, `shift` (`s`), and
enclosures `ũ_t ± absBound` of the exact real part, imaginary part and amplitude at the
target DOF; `reportedError = absBound + |ũ_t − reported_t|` bounds `|u*_t − reported_t|`,
and therefore includes the solver's modal-truncation error. The exact
peak amplitude over the sampled frequencies is enclosed by the max of the per-point
enclosures (the max is 1-Lipschitz). The phase is not bounded.

Honesty tests (`tests/certify_nonlinear.rs`): the same system solved by LU of the real
2n×2n block matrix with double-double residual refinement, at frequencies below, near,
at and above the first resonance; the reference lies within every bound. Unit tests use
decoupled systems with closed-form solutions. Not formalized in Lean.
## Plastic collapse load factor

`engine/src/certify/plastic.rs` (wasm: `certify_plastic_2d`). The solver
(`solve_plastic_2d`) is an event-to-event incremental hinge analysis with bending-only
yield. The certificate encloses the collapse load factor `λ_c` of the *same* plastic
model, independently of how the solver got its number:

* **Model.** 2D frame, rigid–perfectly plastic, small displacements, proportional
  loading `λ·P`. Each member yields only in bending, `|M(x)| ≤ Mp` at every section
  (axial and shear capacity unlimited, no N–M interaction — as in the solver). End
  releases (`hingeStart/End`) carry no moment; a truss member is a member released at
  both ends. Supports restrain DOFs as the 2D DOF numbering does. Loads: nodal
  `(fx, fz, my)`, member point loads (`p` along local y = `(−dz, dx)/L`, `px` along
  the member, couple `my`), linear partial distributed loads. Refused (`certified:
  false` with a reason): springs, inclined supports, nonzero prescribed displacements,
  constraints, connectors, thermal loads, cables, point or partial loads on a member
  whose length is irrational, more than 200 members.
* **Exact data.** Every f64 input is a dyadic rational and is converted exactly
  (`num-rational`). Positions along a member are fractions `t ∈ [0, 1]`; a full-length
  distributed load needs only `L²` (rational), point / partial loads need `L` and are
  accepted only when `L` is rational (`dx² + dz²` a rational square). `Mp` is enclosed
  in `[Mp_lo, Mp_hi]`: an override or `fy·1000·b·h²/4` exactly; the solver's
  approximate `1.15·Iz/(h/2)` with `h = √(12 Iz/A)` by bracketing the square root (1.15
  taken as the decimal 23/20). `λ_c` is non-decreasing in every `Mp`, so the static
  check uses `Mp_lo` and the kinematic check `Mp_hi`.
* **Static theorem (lower bound), `check_static`.** Field: per member the force
  `F = (Fx, Fz)` and moment `Mi` exerted by node i on the member, and `λ`. The member
  equilibrium is built in: `F_j = −F − λW`, `M_j = −Mi + d × F − λ Lm(1)`, and the
  bending moment at section `t` is `M(t) = −Mi + t (d × F) − λ Lm(t)`, with `Lm` the
  moment of the member loads on `[0, t]` about the section — a piecewise cubic with
  rational coefficients (breakpoints at load positions; both one-sided values are
  checked at couples). The checker verifies *exactly* that the sum of member end forces
  equals `λ P` at every free nodal DOF and that released ends carry zero moment, then
  bounds `U_e ≥ max_t |M_e(t)|` exactly by Bernstein coefficients with subdivision (the
  end values are exact, interior bounds tight to `2⁻⁴⁰ Mp`). The field scaled by
  `s = min_e Mp_lo,e / U_e` is in equilibrium with `sλ P` (the equations are
  homogeneous in the field and `λ`) and admissible, so **`λ_c ≥ λ_lo = sλ`**.
* **Kinematic theorem (upper bound), `check_mechanism`.** Mechanism: nodal virtual
  displacements `(ux, uz, θ)`, and per member interior hinge positions
  `0 < t₁ < … < t_h < 1` with rigid-segment rotations `ω₀ … ω_h`. The checker verifies
  exactly: restrained DOFs are zero; walking the segments from node i
  (`δ += ω (Δt)(−dz, dx)`) lands on node j's displacement; a non-released end where
  the member cannot form a hinge (no `Mp`) has no relative rotation. Dissipation
  `D = Σ Mp_hi |θ|` over end hinges (`ω₀ − θᵢ`, `θⱼ − ω_h`, released ends excluded) and
  interior hinges (`ω_s − ω_{s−1}`); external work `W` of nodal loads, point loads
  (force·δ, couple·ω; a couple at a rotating hinge is refused) and distributed loads
  (∫ q(t) (−dz, dx)·δ(t) dt, exact). If `W > 0`, **`λ_c ≤ λ_up = D/W`**.
* **Output.** `[λ_lo, λ_up]` rounded outward to f64; `certified` when both exist. Also
  the mechanism's hinges, the solver's collapse factor, `solverWithinBounds` and
  `solverDeviation` (relative distance outside the enclosure; see the finding below).
* **How candidates are found (not trusted).** The equilibrium equations `A x = λ b`
  are solved by exact Gauss–Jordan: particular solution `x_p`, self-stress basis `N`.
  Any `x = λ x_p + N z` with rational `λ, z` is in exact equilibrium. `λ, z` come from
  the classical limit-analysis LP (max λ s.t. `|M| ≤ Mp` at sampled sections, solved in
  f64 through its dual, with cutting planes at the interior extrema of `|M|`) and from
  the incremental solver's final state (projected onto `λ x_p + N z`). The mechanism is
  an exact null vector of the compatibility equations with hinges at the LP's active
  sections (or a least-squares combination of the null basis). Heuristic failures only
  cost a bound (`Uncertified`), never soundness.

Findings (fixed): the incremental solver used to *overestimate* `λ_c` when a member's
maximum moment was interior (distributed load on a member without interior nodes) — it
recorded the span hinge at an element end: fixed–fixed beam under UDL, one element 60.28,
five elements 58.59, certified `[37.5 − 1ulp, 37.5]` (= 16Mp/qL²); inclined member 310.0
vs 192.857. It also never checked whether a formed hinge unloads, so it could fall
*below* the enclosure (3-bay frame of the random test: 148.80 vs [151.540540540539,
151.540540540541]). `solve_plastic_2d` now (i) searches the moment diagram of every
loaded member for interior extrema (exact diagram between sections, 48 stations plus
load breakpoints, golden-section refinement of local minima of the load increment) and
splits the member where a span hinge forms (`PlasticHinge.position` ∈ [0, 1]; results
stay on the model's own members and nodes); (ii) before each increment closes a hinge
whose rotation would reverse (relative end rotation recovered from the unreleased
element stiffness; `unloadedAt`), reopens a closed one loaded past Mp again, and at a
mechanism closes a hinge that would unload under the mechanism's motion (with hinge h
closed, the unit moment at h is `P·φ / θ_h(φ)`), tied hinges being opened one at a
time so the mechanism tested is single; (iii) reports `warnings` when the result is not
guaranteed (unresolved reversal, a peak moving past a fixed hinge, event limit reached,
final field over Mp). All certify tests and the 24 random frames now land inside the
enclosure up to f64 round-off (`solverDeviation < 1e-9`, asserted).

Not included: N–M interaction, second-order effects, shakedown. Not formalized in Lean.

### Plastic collapse load factor, 3D

`engine/src/certify/plastic_3d.rs` (wasm: `certify_plastic_3d`). The solver
(`solve_plastic_3d`) uses, per section, the **biaxial (elliptical) yield condition of
the local bending moments** `(My/Mp_y)² + (Mz/Mp_z)² ≤ 1` (axial force, shear and torsion
unlimited; a member yields only when both `Mp_y`, `Mp_z` are finite). The certificate
encloses `λ_c` of the same rigid–perfectly plastic model with *associated* flow:

* **Model.** 3D frame members (`frame`, `truss` = released at both ends in every
  rotation), releases per axis (`releaseMy/Mz/T Start/End`), supports by DOF flags.
  Loads: nodal `(fx, fy, fz, mx, my, mz)`, member distributed loads (`qX`, `qY`, `qZ`,
  partial) and point loads (`py`, `pz`). Local axes are rebuilt exactly from the
  solver's rule (`compute_local_axes_3d`: default Z-up / X for vertical members, an
  explicit `localY`, roll angles in multiples of 90°, left-hand flag) as rational
  directions `u_y`, `u_z` ⟂ `d`; the yield condition uses `(C·u_y)²/|u_y|²`, so no
  square root is needed. A member *load* needs exact unit axes (length and both axis
  norms rational, e.g. axis-aligned or 3-4-5 members); otherwise it is refused.
  `Mp_y, Mp_z` are enclosed exactly from the solver's formulas (`b h²/4`, `d b²/4`,
  `h b²/4`, or the 1.15 shape-factor approximation with a bracketed root) or overrides.
  Refused with a reason: springs, inclined supports, prescribed displacements,
  constraints, connectors, shells, curved beams, thermal and shell loads, bimoments,
  cables, other roll angles, transverse loads on trusses, more than 120 members.
* **Static theorem, `check_static_3d`.** Per member the force `F` and moment `Mᵢ` of
  node i on it (6 rationals) and `λ`; `F_j = −F − λW`, `M_j = −Mᵢ + d × F − λ Lm(1)`
  with `Lm(t) = Lm_y(t) e_z − Lm_z(t) e_y` (the 2D piecewise cubic per bending plane).
  Exact equilibrium at every free DOF and zero moment at every release; then
  `f(t) = (C·u_y)²/(|u_y|² Mp_y,lo²) + (C·u_z)²/(|u_z|² Mp_z,lo²)` — a degree-6
  polynomial per piece — is bounded above exactly by Bernstein coefficients with
  de Casteljau subdivision, and the field scaled by a rational `s` with `s² max f ≤ 1`
  is admissible: **`λ_c ≥ sλ`**.
* **Kinematic theorem, `check_mechanism_3d`.** Nodal virtual displacements and
  rotations (6 per node), per member interior hinge positions and segment rotation
  vectors `ω_s`. Exact checks: restrained DOFs zero, segments close
  (`δ += Δt ω × d`), no torsional discontinuity except at a torsion release, no
  rotation in a component without a release where no hinge can form. Dissipation per
  hinge `√(Mp_y,hi² ρ_y² + Mp_z,hi² ρ_z²)` (released components dropped), each root
  bounded *above* by a rational; work of nodal forces and couples and of member loads
  (exact integrals). `W > 0` ⇒ **`λ_c ≤ D/W`**.
* **Candidates (not trusted).** Exact equilibrium basis `x = λ x_p + N z` (Gauss–
  Jordan). An f64 LP maximizes λ with the ellipse replaced at every sampled section by
  an *inscribed* polygon, refined where the field sits on its boundary (new vertex at
  the moment's direction, or bisection of the edges next to the vertex it sits on) and
  at interior maxima of loaded members. Its field, the solver's final state and an LP
  re-solved with vertices at the mechanism's normality points are checked statically.
  Mechanisms: exact compatibility null space for hinges at the LP's active (and
  yielded) sections, then the least-`D/W` combination (IRLS on the sum of norms) and a
  least-squares fit to the LP's hinge rotations, polished by recomputing with the
  hinges that turn.

**Solver changes (3D).** The old solver placed hinges only at element ends and treated
any failed or singular solve as collapse. Before → after, `Mp_y = 100`, `Mp_z = 50`:
fixed beam under UDL in one element, `16 Mp/(qL²)` = 4.444 (q_z) / 2.222 (q_y): **3.333
/ 1.667** (stopped, no span hinge) → 4.444 / 2.222; three elements **5.000 / 2.500**
(above the collapse load) → exact; space portal (h = 3, span 4) in-plane sway
`4 Mp_y/(H h)` = 133.33: 133.325 → 133.33; out-of-plane sway `2 Mp_z/(H h)` = 33.33
(the frame turns about the base line): **77.04** (2.3× the collapse load) → 33.33.
`solve_plastic_3d` now shares the 2D event search (`span_candidates`: interior
extrema, golden-section refinement, member splitting, `PlasticHinge3D.position`),
closes a hinge whose plastic rotation does negative work against its moment
(`M·θ < 0`, end rotations recovered from the unreleased local stiffness;
`unloadedAt`), reopens a closed hinge on the yield surface loaded outward, tests ties
and unloading at mechanisms like 2D, and adds `warnings`. A 3D hinge frees both bending
rotations, so a mechanism can be one the loads do no work on (a plane frame hinged at
its column bases turns about the base line): such a state is solved with soft springs
(10⁻¹⁰ of the softest member's bending stiffness) and accepted only if the member
forces balance the applied loads at every free DOF and close along every member
(the linear solver's own residual is not used — it includes artificial rotational
springs, through which a cantilever hinged at its base "carries" its tip load). A
node where every frame end would turn freely in bending and whose rotation neither
member torsion nor a support restrains gets no further hinge (the corner of a plane
frame takes one hinge, not two).

**What is certified, and the limitation.** The certificate encloses the associated-flow
collapse factor of the ellipse model; for planar action (every hinge uniaxial, e.g. the
fixed beams, both sway modes, plane frames placed in space along rational plan
directions) the enclosure is tight to ~1e-12 and the solver lands in it
(`solverDeviation < 1e-9`; of 20 random plane frames with member loads, 14 land
inside, asserted, and 6 carry the 2D warning that a span peak passed a fixed hinge —
those are approximate and may lie up to ~0.6 % above the enclosure). The solver's hinge **holds the moment vector
it formed with** and turns freely about both axes — not normal to the ellipse — so under
biaxial bending its final field is admissible but not the collapse field: it is a safe
lower bound, below the enclosure, and warns (`hinges under biaxial bending…`). Portal
under equal sway loads in X and Y: solver 32.03, certified `[33.33 − ε, 33.33]`. For
random space frames with biaxial hinges the polygon LP can converge slowly; relative
widths ≤ 1e-4 are asserted (7 of 8 small random space frames are within 1e-10, one at
4.8e-6), and the solver never exceeds the upper bound (all 8 fall 0.4–3.6 % below the
enclosure, with the biaxial warning). Making the solver exact for biaxial hinges
would need associated flow with the moment moving along the curved surface, which an
event-to-event method with linear steps cannot follow exactly.

## Time-history integration

`engine/src/certify/dynamics.rs` (wasm: `certify_time_history_2d/3d`). The traced
solver entry points (`solve_time_history_{2d,3d}_traced`) return the discrete system
they integrated — the f64 reduced `K`, `M` (after constraint reduction), Rayleigh
coefficients `a0, a1` (`C := a0·M + a1·K` exactly, in real arithmetic), the f64
Newmark `β, γ` actually used, `Δt`, the load vectors `f_n` — and the full computed
state `(u_n, v_n, a_n)`, n = 0..N. These are the data; the certificate is about the
**discrete scheme**:

    (E_n)  M a_n + C v_n + K u_n = f_n                                  (Newmark; HHT at n = 0)
    (E_n)  M a_n + (1+α)(C v_n + K u_n) − α(C v_{n−1} + K u_{n−1})
               = (1+α) f_n − α f_{n−1}                                 (HHT-α, n ≥ 1)
    (U)    u_{n+1} = u_n + Δt v_n + Δt² ((½ − β) a_n + β a_{n+1})
    (V)    v_{n+1} = v_n + Δt ((1 − γ) a_n + γ a_{n+1})

HHT-α uses Hilber's sign, `α ∈ [−1/3, 0]`, with `β = (1−α)²/4`, `γ = ½ − α`; the
solver rounds `γ` and integrates with `α = ½ − γ` (exact in f64), so `γ = ½ − α` holds
exactly for the recorded `α`. Finding (fixed): the solver's "HHT-α" used to be
Newmark with those `β, γ` and only the load blend `(1+α) f_{n+1} − α f_n` — without the
α-weighting of `K u` and `C v` it was dissipative but first-order accurate. It is now
the scheme above; `test_hht_alpha_second_order_convergence` shows the error ratio ≈ 4
when Δt halves (α = −0.05, −0.1, −0.3) and `test_hht_alpha_damps_high_frequencies`
the numerical damping at `ωΔt ≈ 33`.

* **Stability (`stabilityCertified`).** HHT-α: generalized-α with `α_m = 0`,
  `α_f = −α`, unconditionally stable (Chung & Hulbert 1993) when `γ = ½ − α`,
  `−½ ≤ α ≤ 0` and `β ≥ ¼ − α/2`, checked exactly on the f64 values; outside that
  range nothing is certified. Newmark: exact rational checks on the f64 `β, γ`:
  `γ ≥ ½` and `2β ≥ γ` ⇒ unconditionally stable (spectral radius ≤ 1 for every mode,
  `ξ ≥ 0`); `β ≥ (2γ+1)²/16` is reported separately (`highFrequencyComplex`). For
  `γ ≥ ½`, `β < γ/2` (conditionally stable, e.g. linear acceleration) the condition is
  `Δt² λ_max(M⁻¹K) ≤ Ω_crit² = 1/(γ/2 − β)` (the undamped limit; Rayleigh damping with
  `a0, a1 ≥ 0` gives every mode `ξ ≥ 0`, which only raises `Ω_crit`). An estimate `μ` of
  `λ_max` is certified as an upper bound by proving `μM − K ≻ 0` (entries enclosed in
  intervals, Gram residual + Gershgorin): then `xᵀKx < μ xᵀMx` for all `x ≠ 0`, so every
  eigenvalue is `< μ`. `Δt² μ (γ/2 − β) ≤ 1` is checked exactly and the certified stable
  step `√(1/(μ(γ/2 − β)))` is reported rounded down. The modal argument's hypotheses
  are certified too: `M ≻ 0`, `K ≻ 0` (Gram + Gershgorin) and `a0, a1 ≥ 0`.
  `γ < ½` is never certified.
* **Residuals.** For every step the residuals of (E), (U), (V) for the computed
  trajectory are enclosed in outward-rounded interval arithmetic. Reported:
  `maxAbsEquation` (certified ≥ max_n ‖r_E,n‖_∞), `maxRelEquation` (relative to the
  largest term of (E) over all steps), and the (U), (V) residuals relative to the peak
  ‖u‖_∞, ‖v‖_∞. Rounded up.
* **Energy balance.** Interval enclosures of `E_n = ½ v_nᵀMv_n + ½ u_nᵀKu_n` (first
  and last), the discrete external work `Σ ½(f̂_n + f̂_{n+1})·(u_{n+1} − u_n)` (`f̂_n = f_n` for Newmark), the
  Rayleigh dissipation `Σ Δt v̄ᵀCv̄` (`v̄ = (v_n + v_{n+1})/2`), and the imbalance
  `E_N − E_0 + D − W`. For average acceleration (β = ¼, γ = ½) the identity
  `E_{n+1} − E_n + Δt v̄ᵀCv̄ = ½(f̂_n + f̂_{n+1})·(u_{n+1} − u_n)` holds exactly for the exact
  discrete trajectory (from (U), (V), (E_n), (E_{n+1}) and `K = Kᵀ`), so the imbalance
  measures the computed trajectory's departure from it; for other parameters it also
  contains the scheme's algorithmic dissipation (HHT-α included, with the work taken
  over `f̂_n = (1+α) f_n − α f_{n−1}`) and is reported, not judged.
* **What this certifies.** That the reported trajectory solves the *discrete* scheme up
  to the reported residuals, and (when `stabilityCertified`) that the scheme is stable
  for this model and step. It does **not** bound the error of the computed trajectory
  against the exact discrete trajectory (no forward-error propagation), nor the
  time-discretization error against the continuous ODE `M ü + C u̇ + K u = f(t)`. The
  latter is only *estimated*: `timeErrorEstimate` is the Zienkiewicz–Xie local
  displacement error `max_n ‖(β − 1/6) Δt² (a_{n+1} − a_n)‖_∞` — an estimate, not a bound.
  The load sequence `f_n` is taken as data as the solver evaluated it (interpolation of
  force histories and ground-motion products included). Not formalized in Lean.

**What the certificate found: modal truncation.** The solver superposes the lowest modes
(at most `min(100, n/2)` from the eigensolve, and only those with `ω_j < 4·ω_max`); plain
superposition left the reported values off by up to 7e-5 of the peak on the 18-DOF test
frame (reported peak 6.258509e-2 vs. the certified exact 6.258518e-2, max reported error
4.35e-6). The solver now adds the omitted modes' contribution as a series in
`z/(λd)` (`d = 1 + ia₁ω`, `z = ω² − ia₀ω`, both exact for Rayleigh damping): the static
(mode-acceleration) term `r₁/d` with `r₁ = (K⁻¹f)ₜ − Σ_kept pⱼ/λⱼ` and its first dynamic
term `z r₂/d²` with `r₂ = (K⁻¹MK⁻¹f)ₜ − Σ_kept pⱼ/λⱼ²` (two solves with the factored K),
applied at a frequency when `|z| < ½ λ_omit|d|` for a lower bound `λ_omit` on the omitted
eigenvalues. On the same frame the reported peak is 6.258518e-2 and the max reported
error 5.06e-9 (still `reportedWithin = false`: the enclosures are ~1e-12 wide and the
remaining error is the series' `O(q²)` tail and the eigensolver's accuracy). Max error
over the sweep, relative to the peak: 6.95e-5 → 8.1e-8 (18 DOF, dense path), 5.0e-5 →
9.5e-10 (72 DOF, sparse path) (`harmonic_static_correction_matches_exact`). The result
reports `method` (`modal`, `modal+static`, `direct`), `modesUsed`, `nDof`,
`truncationRatio` (share of the static target response carried by the omitted modes) and
`warnings` (frequencies where the correction could not be applied,
`harmonic_truncation_is_reported`).

## Which K is certified

A certificate is about the K, f (and M, K_G) the solver assembled, right or wrong, except
the linear static result certified end to end (see "End-to-end certificates"), which is
about the model. That
the dense, sparse, `_ex`, parallel and constrained paths assemble the same matrices, and
that the certificates' own reduced systems (`reduced_sparse_2d/3d`, `buckling_system_2d/3d`)
equal them, is checked separately by the cross-path assembly oracle,
[ASSEMBLY.md](ASSEMBLY.md).

## Non-finite numbers

A certificate never reports success on a NaN or an infinity (issue #335). `f64::max`,
`min` and every comparison drop or misread NaN, so a single NaN can turn into an error
bound of 0: the spectral certificate once reported `certified` with error 0 for results
that were all NaN. `certify::finite` walks any input, result or certificate with a serde
serializer (as the fuzz harness does, FUZZ_MUTANTS.md) and every entry point the WASM
layer exposes uses it:

- a non-finite number anywhere in the input, or in the solver's results, is an `Err`
  (`check_input`, `check_results`); the solvers should refuse first, this is the
  backstop;
- the `certify_*_results` functions, which take results from the caller, return
  `Uncertified` instead;
- a certificate that claims anything while carrying a non-finite number is withdrawn
  (`guard`): the enum certificates become `Uncertified`, the time-history certificate
  drops its stability and residual claims, a plastic certificate its bounds, a design
  member its utilization, a linear certificate its force, station, deflection and
  reaction bounds, and a combination its bounds (and then the envelope too, since it
  maximizes over the combinations);
- the bundles are refused if they would carry one.

The only exception is +∞ in a field that documents it (`DOCUMENTED_INFINITE`:
`relBound`, `omega2Upper`, `uniquenessRadius`, the `bimoment` of combined force bounds,
`b2Factor`); NaN is never allowed. `tests/certify_nonfinite.rs` sets every number of a
valid input for each certificate kind to NaN and +∞, and random ones to NaN, ±∞, ±1e308,
1e-300 or a subnormal, and requires an `Err` or a fully finite `Ok`.

The exact plastic certificates also refuse input numbers whose magnitude is outside
[1e-30, 1e30] (zero excepted): their rational arithmetic costs grow with the bit length
of the data, and a value of 1e300 ran for minutes. That is a resource cap, not a
soundness condition.

## Rounding model

f64 ops round to nearest, so the exact result is within 0.5 ulp of the computed one.
Outward rounding = compute in round-to-nearest, then `next_down` the lower endpoint
and `next_up` the upper. Non-finite endpoints abort the certificate. In Lean this is
modelled by abstract `down, up : ℝ → ℝ` with `down x ≤ x ≤ up x`.

## Out of scope for v1

Corotational / large-displacement nonlinear static solvers (their residuals involve
rotations and are not polynomial in `u`; the quadratic Kantorovich argument of "P-Delta"
does not apply as is), material nonlinearity, time integration. Mechanism certificates (exact rational null vectors), and proving the f64 implementation matches the Lean algorithm. (Large
models are covered by the Gram/Gershgorin certificate above; the dense interval
Cholesky is used only below the solver's sparse threshold.)
