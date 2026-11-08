# Scale-invariant stability and rank test

Status: design, slice 1 (`engine/src/solver/stability.rs`) implemented. Tracks #762, #758,
#1445, #369, #382 and the 47 nightly findings of triage cluster C08 (canonical #954).

## 1. How the engine decides today

Each solver entry decides "stable" on its own, from the factorization it happens to run,
with thresholds measured against quantities that change with units, orientation or
numbering. File:line references are to `origin/main` at 8c8153a1e.

| Where | What it does | Why it is not invariant |
|---|---|---|
| `solver/assembly.rs:501-556` (2D dense) | Adds `1e-10 · max_diag` to the rotation of every node whose frames are all hinged there, and to every `orphan_rotation_dofs` DOF | `max_diag` is the largest diagonal of the whole matrix, usually a translation (force/length) added to a rotation (force·length): the spring's weight changes with units. A mechanism behind it solves |
| `solver/assembly.rs:80-91` `orphan_rotation_dofs` | A rotation is "orphan" if its diagonal is ≤ `1e-12` of the largest rotation diagonal of the same node | Per global axis: a rotation free about an inclined member axis (torsion release on a skew member) has no zero diagonal and is missed in one orientation, caught in another |
| `solver/assembly.rs:1150-1167`, `2615-2630` (3D dense, sparse) | Same `1e-10 · max_diag` spring on warping DOFs and 3D orphan rotations | Same units mixing; `artificial_stiffness_entries` (`assembly.rs:29`) hands the same springs to co-rotational, arc-length, material and fiber nonlinear |
| `solver/staged.rs:586-640`, `833-870` | Its own copy of the spring for disconnected and fully hinged nodes | Not covered by #1428's orphan threshold (#1445) |
| `solver/linear.rs:955-969` (2D dense) | Cholesky; on failure dense LU. A successful LU returns results with a `StiffnessNotPositiveDefinite` warning | LU succeeds on round-off pivots: whether it does depends on the pivot order (numbering) and on the rounding of the rotated element matrices (orientation) |
| `solver/linear.rs:830-947` (2D sparse) | Unshifted sparse Cholesky, then dense LU | As above, and the AMD order changes with the numbering |
| `solver/linear.rs:2430-2530` (3D sparse) | Shift ladder: adds `alpha · max_d` to the diagonal until Cholesky succeeds; returns the shifted solve with a warning | A hidden spring, scaled by the largest diagonal of any kind |
| `solver/definiteness.rs:53` | Warns when a Cholesky pivot is ≤ `1e-10` of its diagonal | Pivots depend on the elimination order (numbering) |
| `solver/conditioning.rs:39`, `linear.rs:578-638` | Near-zero diagonal ≤ `1e-12 · max_diag`; ratio `max/min` of the raw diagonal > `1e8` | Raw diagonal mixes force/length and force·length |
| `known_issues.rs:219-272` | `NUM-INVARIANCE` warning from the two tests above, or a round-off pivot | A warning only; the number is returned |
| `solver/kinematic.rs:220-276` | Jacobi-scaled LU rank with tolerance `1e-10`; orphan rotations at `1e-10` of the largest rotation diagonal | Jacobi scaling removes units but not orientation (a node's diagonal changes when it rotates); LU rank pivots depend on the numbering. Advisory only: the solvers do not call it |
| `solver/pre_solve_gates.rs:1178` | Exact rigid-body restraint check | Skipped with constraints, connectors, curved beams or inclined supports |

So the same structure can be refused in one frame and returned in another (#762, the C08
findings), a mechanism can be returned behind an artificial or shift spring (#458, #1496),
and the plastic collapse factor, which solves a sequence of nearly singular systems, moves
by up to 4.6× (#758).

## 2. The test

The free (and, with constraints, independent) stiffness `K` is symmetric positive
semidefinite: a sum of element, spring and connector contributions, each positive
semidefinite. It is assembled **without** any artificial stiffness. The test only reads `K`
and, for each free DOF, its node and kind (translation, rotation, warping).

### 2.1 Node blocks and local free directions

For every node and kind, `B` is the block of `K` on that node's free DOFs of that kind
(1×1 to 3×3). Its eigenvalues `μ₁ ≤ … ≤ μ_b` and eigenvectors are computed exactly
(symmetric Jacobi on at most 3×3).

- A rigid rotation of the model maps `B` to `RᵀBR`, a mirror the same with `det R = −1`,
  so `μ` are unchanged and the eigenvectors turn with the model.
- A unit change multiplies every entry of `B` by one positive factor (all its DOFs have the
  same kind), so ratios of `μ` are unchanged.
- Relabelling permutes the blocks.

A direction `v` of the block is a **local free direction** when

    μ ≤ τ_loc · μ_b            (within the node: anisotropy beyond round-off), or
    μ_b ≤ τ_kind · max μ_b      (the whole block is round-off of the stiffest block of
                                 the same kind in the model)

with `τ_loc = τ_kind = 1e-12`. By positive semidefiniteness, `vᵀKv = 0` implies `Kv = 0`:
a local free direction is a null vector of `K` up to the rounding of its assembly, which is
`O(ε)` of the largest stiffness acting on that node (an inclined member rounds its axial
stiffness into the transverse directions). Below `τ_loc` the direction cannot be told from
that rounding. The ratio `μ_b / μ` is the node's **anisotropy**; it is also the factor by
which that rounding is amplified in the solution of the soft direction, which is what makes
an axis-aligned and an inclined copy of the same slender member disagree.

### 2.2 Equilibrated scaling

`W` is block diagonal: on each node block, `B^{-1/2}` restricted to the directions that are
not locally free (`v μ^{-1/2}` for each kept eigenpair). Then

    S = Wᵀ K W

has identity diagonal blocks. Under rotation, mirror and relabelling `S` is replaced by
`QᵀSQ` with `Q` orthogonal; under a unit change by `S` itself. Its spectrum is therefore
**exactly invariant** under all four transforms. Plain Jacobi scaling (`D = diag K`) is
invariant under units but not under rotation, which is why `kinematic.rs` still moved.

`λ_max(S)` comes from power iteration, `λ_min(S)` from inverse iteration on a Cholesky
factor of `S` (dense below 600 DOFs, sparse above), each to `1e-6` relative. A Cholesky that
breaks down means `S` is numerically not positive definite: `λ_min ≤ O(ε) λ_max`.

### 2.3 Verdict

    κ_S = λ_max(S) / λ_min(S)        A = max over nodes of μ_b / μ_1 (kept directions)

- **Mechanism** if any local free direction has a translational component, or `S` does
  not factor, or `κ_S > 1/τ_mech` with `τ_mech = 1e-13`.
- **Unresolved** if `κ_S · A > R_max = 1e12`: the smallest eigenvalue is within the
  assembly rounding `ε · A · λ_max` amplified by `κ_S`, so the rank itself is not
  determined in double precision.
- **Stable**, with a list of **free rotations** (local free directions that are rotations or
  warping), otherwise.

Every quantity in the verdict is a function of the spectra of `B` and `S`, so two
transformed copies of a model get different verdicts only if one of `κ_S`, `κ_S · A`, `μ/μ_b`
lies within its own estimation error (`≲ 1e-6` relative) of a threshold. The proof tests
check the verdicts of the C08 models under units, rotation, mirror and relabelling.

## 3. Refusal policy

- Mechanism and Unresolved are refusals at every solver entry, before any factorization of
  the system the solver uses, with a diagnostic naming the nodes that carry the
  near-null vector (the converged inverse-iteration vector) and `κ_S`, `A`.
- No entry may shift, regularize or LU-solve its way past a refusal. The PCG and LU
  fallbacks stay only for systems the test called Stable.
- An Unresolved verdict is never downgraded to a warning: the result would be one of two
  answers, and the test cannot say which.
- Existing warnings (`NUM-INVARIANCE`, `StiffnessNotPositiveDefinite`, `CERT-MECHANISM`)
  remain for Stable systems whose forward error bound `4(n+24) ε κ_S A` exceeds `1e-6`.

## 4. Replacing the artificial springs

A Stable verdict's free rotations are exactly the DOFs the springs exist for (truss-only
nodes, nodes where every member is hinged, torsion-free member ends, warping without
stiffness), now found per direction instead of per global axis.

1. The entry removes them from the system: `u = W' y` over the kept directions, so the
   solved system is `Wᵀ K W` restricted to the kept directions, with no spring. Their
   displacement is reported as zero (as the spring gave for an unloaded DOF).
2. A load with a component along a free rotation (nodal moment, or the end moment of a
   member load) is refused, as 3D does today (#1445 parity).
3. After the solve, the residual `vᵀ(f − K u)` on each removed direction is the force the
   removal attracted. It must be at round-off of the node's forces; otherwise the direction
   was real but soft and the result is refused (the hard form of `ORPHAN-SOFT-ROTATION`,
   #1496).

Free motions of the whole model (a model held only by springs that do not reach every
rigid motion) and connector/skew mechanisms are not special cases: they are null vectors of
`S` with translations, hence Mechanism.

## 5. Slices

1. `solver/stability.rs`, the verdict and its metamorphic proof on the C08 corpus (this
   slice changes no result).
2. Linear 2D and 3D (dense, sparse, PCG, constrained), including the spring removal and the
   `NUM-INVARIANCE`/`ORPHAN-SOFT-ROTATION` entries it retires.
3. P-Delta and the nonlinear tangents that consume `artificial_stiffness_entries`.
4. Buckling and modal (the stiffness side of the pencil).
5. Plastic 2D (#758: every hinge stage is a new `K`; the original-path refusal is lifted
   only when the stage verdicts are invariant).
6. Staged construction (#1445: its own spring copy).

Each slice carries its reproducers, a results-change registry entry for every model whose
answer becomes a refusal, and states whether an advisory is needed.
