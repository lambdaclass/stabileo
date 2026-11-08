# Scale-invariant stability and rank test

Status: slice 1 (`engine/src/solver/stability.rs`, the verdict) implemented; no solver calls it yet. Tracks #762, #758,
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

`λ_max(S)` comes from power iteration and `λ_min(S)` from inverse iteration on a sparse
Cholesky factor of `S`, both with Rayleigh quotients converged to `1e-9` relative. The
iterations start from a fixed vector, but their limits are eigenvalues and do not depend on
it. A Cholesky that breaks down means `S` is numerically not positive definite.

### 2.3 Verdict

    κ_S = λ_max(S) / λ_min(S)        A = max over nodes of μ_b / μ_min (kept directions)

- **Mechanism** if a local free direction is a translation: a node can move in a direction
  nothing stiffens. This is decided node by node and is exact.
- **Singular** if `κ_S · A > R = 1e12`, or `S` does not factor. Assembly rounds every node
  block to `ε μ_b`; scaled by `B^{-1/2}` that is `ε A` in `S`, and the smallest eigenvalue
  moves by `ε A κ_S` relative. At `R` that is `2.2e-4`: the smallest eigenpair, and the
  displacement it carries, keep fewer than four digits, and a stable and a singular model
  cannot be told apart beyond that. A mechanism and a near-mechanism are one verdict on
  purpose: which of the two a copy is reported as depends on rounding, so separate verdicts
  were not invariant (measured on the C08 models: `κ_S` of the same model was 2.7e11 in one
  frame and a failed factorization in another).
- **Stable**, with its **free rotations** (local free directions that are rotations or
  warping), otherwise.

Every quantity in the verdict is a function of the spectra of `B` and `S`, so two
transformed copies of a model get different verdicts only if `κ_S · A` or a block ratio
`μ/μ_b` lies within its own rounding of a threshold.

### 2.4 Evidence (slice 1, `engine/tests/metamorphic/stability.rs`)

- The 47 C08 reproducers under 4 unit systems, 3 general rotations, 3 quarter turns, 4
  mirrors and 4 relabellings (3D: random rotations, axis permutations, mirrors about each
  axis): every stable or refused verdict, and the number of free directions, is identical.
  25 are refused (13 Mechanism, 12 Singular), 22 are Stable.
- The predicted drift `ε κ_S A` matches what the harness measures today: #993
  (`κ_S A = 1.0e12`) drifts 1.4e-4 under units and #1115 (`2.8e12`) 2.9e-4, against a
  prediction of 2.3e-4 and 6.3e-4.
- Of the 13 Stable reproducers whose recorded analysis and relation hold today, all hold;
  the other 9 Stable ones do not hold today for reasons the verdict does not cover (§5).
- No model of the example, fixture, feature-matrix or differential corpus is refused.
  Of the 117 refused random `fuzz_rich` models, 102 are refused by the linear solver today
  and 14 are solved with `StiffnessNotPositiveDefinite` or `NUM-INVARIANCE`; the last,
  `fuzz_rich_3d/74` (`κ_S A = 7.9e13`), is solved silently today, and the metamorphic
  harness rates every one of its transforms inconclusive.
- A stiff frame on springs a million times softer than its members (`κ_S A = 3.9e12`) is
  refused in every frame; on springs a thousand times softer it is Stable.

## 3. Refusal policy

- Mechanism and Singular are refusals at every solver entry, before any factorization of
  the system the solver uses, with a diagnostic naming the nodes that carry the
  near-null vector (the converged inverse-iteration vector) and `κ_S`, `A`.
- No entry may shift, regularize or LU-solve its way past a refusal. The PCG and LU
  fallbacks stay only for systems the test called Stable.
- A Singular verdict is never downgraded to a warning: the result would be one of two
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
   `NUM-INVARIANCE`/`ORPHAN-SOFT-ROTATION` entries it retires. Reproducers: the Singular and
   Mechanism C08 models with a linear relation (#993, #1353, #1355, #1651), and #1106,
   whose free rotation is held by no spring in one orientation.
3. P-Delta and the nonlinear tangents that consume `artificial_stiffness_entries`
   (#972, #1090, #1647, #1653).
4. Buckling, modal and time history: the stiffness side of the pencil (#1351, #1352,
   #1362, #1635, #1648).
5. Plastic 2D (#758: every hinge stage is a new `K`; the original-path refusal is lifted
   only when the stage verdicts are invariant).
6. Staged construction (#1445: its own spring copy; #968, #1091).

Not this test: #1099 (Stable, `κ_S = 5.4`) breaks linear superposition by 12 % on the
sparse path, which no conditioning explains, and #1193 refuses an SSI copy of a Stable
model; both go back to triage.

Each slice carries its reproducers, a results-change registry entry for every model whose
answer becomes a refusal, and states whether an advisory is needed.
