# Scale-invariant stability and rank test

Status: slice 1 (`engine/src/solver/stability.rs`, the verdict) and slice 2 (the linear 2D and 3D solvers: dense,
sparse, PCG and constrained) implemented; the other solvers do not call it yet. Tracks #762, #758,
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
semidefinite. It is assembled **without** any artificial stiffness: the assemblers run with
their springs set to zero (`assembly::without_artificial_stiffness`), so a physical diagonal
smaller than the spring's rounding (`1e-20 + 1 − 1 = 0`) survives in every unit system.
Subtracting the springs afterwards does not. The test only reads `K` and, for each free DOF,
its node and kind (translation, rotation, warping). A non-finite entry of `K`, or a block
eigenpair that is not finite, is Singular before anything is classified or dropped.

### 2.1 Node blocks and local free directions

For every node and kind, `B` is the block of `K` on that node's free DOFs of that kind
(1×1 to 3×3). Its eigenvalues `μ₁ ≤ … ≤ μ_b` and eigenvectors are computed exactly
(symmetric Jacobi on at most 3×3).

- A rigid rotation of the model maps `B` to `RᵀBR`, a mirror the same with `det R = −1`,
  so `μ` are unchanged and the eigenvectors turn with the model.
- A unit change multiplies every entry of `B` by one positive factor (all its DOFs have the
  same kind), so ratios of `μ` are unchanged.
- Relabelling permutes the blocks.

Partition the block by its structural coupling graph as defined below. A direction `v` of
a connected component is a **local free direction** when

    μ ≤ τ_loc · μ_b   with τ_loc = 1e-12, or the whole component is zero (μ_b ≤ 0).

A block is never judged against another node: a soft but restrained node next to a stiff
one carries no rounding from it. By positive semidefiniteness, `vᵀKv = 0` implies `Kv = 0`:
a local free direction is a null vector of `K` up to the rounding of its assembly, which is
`O(ε)` of the largest stiffness acting on that node (an inclined member rounds its axial
stiffness into the transverse directions). Below `τ_loc` the direction cannot be told from
that rounding. Both the local-free classification and **anisotropy** use each connected
component’s eigenpairs and largest eigenvalue, rather than comparing uncoupled components.
Partition each node-and-kind block into connected components of its coupling graph. An edge is present for
any nonzero off-diagonal entry, or when an incident element or support transformation mixes
the two directions. Edges are exact structural tests, with no magnitude cutoff. Transformation
edges survive cancellation between assembled contributions. Each component contributes its
largest eigenvalue divided by its smallest kept eigenvalue; `A` is the largest of these ratios.
A singleton contributes one. Membrane and bending directions within a shell plane are coupled;
three-dimensional solid strains couple all three translations. A curved shell retains its
full components when geometry or directors mix directions; an exactly flat coordinate-plane
shell with axis-aligned directors keeps its normal separate from its tangential component.
Constraint reduction projects the physical coupling components and nonzero stiffness entries
through the nonzero rows of `C`, retaining edges between independent directions of the same
node and kind. A matrix-only constrained API without assembly provenance retains the full
node blocks conservatively.

For an axis-aligned beam the axial and transverse entries are computed from separate local
stiffness entries and multiplied by structural zeros in the transformation. Floating-point
multiplication by zero and addition of zero cannot move axial stiffness into the transverse
entry. Assembly sums each entry separately. Thus disconnected components carry independent
rounding scales; their largest stiffnesses must not be compared to each other's smallest ones.
An oblique beam mixes those entries before assembly, so its components merge and its weak
direction again carries the full anisotropy penalty. Using the assembled block alone would
miss this when incident elements cancel their off-diagonal entries.

### 2.2 Equilibrated scaling

`W` is block diagonal: on each node block, `B^{-1/2}` restricted to the directions that are
not locally free (`v μ^{-1/2}` for each kept eigenpair). Then

    S = Wᵀ K W

has identity diagonal blocks. Under rotation, mirror and relabelling `S` is replaced by
`QᵀSQ` with `Q` orthogonal; under a unit change by `S` itself. Its spectrum is therefore
**exactly invariant** under all four transforms. Plain Jacobi scaling (`D = diag K`) is
invariant under units but not under rotation, which is why `kinematic.rs` still moved.

Up to 64 kept directions the spectrum of `S` is computed in full (cyclic Jacobi). Above,
Lanczos with full reorthogonalization estimates `λ_max(S)` and, on a sparse Cholesky
factor, `1/λ_min(S)`, each until its top Ritz value changes by less than `1e-12` of itself
over ten steps, or after 200 steps (a non-finite value is a failure). A Ritz value never exceeds the extreme eigenvalue
it estimates, but in a cluster (the equal spans of a long continuous beam) it can stop
short of it, so the estimates are certified by inertia: a Cholesky of `S − ℓ I` and of
`u I − S` must both succeed, with `ℓ = 0.999 λ_min` and `u = 1.001 λ_max` first, each
halved or doubled up to ten times until it does. The successes prove
`λ_min(S) > ℓ` and `λ_max(S) < u`, and `κ_S = u / ℓ` is an upper bound, never an
underestimate. An estimate that does not certify, and a Cholesky of `S` that breaks down,
give Singular: the threshold is never passed on an unproved number.

With constraints, `K` is the reduced matrix and each independent DOF takes the node and
kind of its physical DOF. For each node, the constraint's translation rows are applied to
its whole free rotation subspace, with the node's constraint map divided by its largest
entry first (so arms of `1e±200` neither underflow nor overflow). If the largest singular
value of the resulting motion is exactly zero, nothing moves and the rotation stays free (a
spin about a collinear link, in a frame where rounding leaves it exactly zero). If it is
above the rounding of the map, `64 b ε`, a physical translation moves at zero stiffness and
the node is a Mechanism, however small the arm (a link offset by `9e-9` of its length still
swings its slave). In between, rounding cannot settle it and the verdict is Singular.
The test is the largest singular value of that map, so it does not depend on how the free
subspace is spanned. Lanczos starts from a pseudo-random vector and restarts from two more
before an uncertified estimate becomes a refusal.

### 2.3 Verdict

    κ_S = λ_max(S) / λ_min(S)        A = max over nodes and coupling components of μ_max / μ_min (kept directions)

- **Mechanism** if a local free direction is a translation: a node can move in a direction
  nothing stiffens beyond `1e-12` of its own coupling component’s stiffest direction.
  Uncoupled components cannot make each other free.
- Free rotations are dropped from `S` only if the whole dropped set, across all nodes at
  once, is shown decoupled from everything outside each direction's own block (`K v_j`
  restricted to other blocks; within its block `v_j` is an exact eigenvector). Two cases:
  - For every off-block row, form `m_i = Σ_j |K_ij v_j|`. A component of `K v` is
    rounding-level only when `|(K v)_i| ≤ 64 b ε m_i`, where `b` is the direction’s
    node-and-kind block size. Such a residual is omitted from the coupling and pin-force
    checks. This scale uses the actual products in that row, so a single small but real
    coupling cannot hide beneath an unrelated stiff direction. A direction whose own
    stiffness is at rounding, `μ_j ≤ 64 b_c ε μ_max,c`, is Singular if any off-block
    coupling remains; `b_c` and `μ_max,c` belong to its coupling component. An unloaded
    oblique torsional release can therefore solve, while a load along it still refuses.
  - The directions above rounding that couple are taken together: `K̃_DD` is their joint
    stiffness (cross terms between nodes included) scaled to a unit diagonal, `C̃` their
    coupling into the kept directions scaled by `1/√μ_j`. Condensing them back changes the
    scaled kept system by `C̃ K̃_DD⁻¹ C̃ᵀ`; its trace, an upper bound on its largest
    eigenvalue, must satisfy `trace · κ_S ≤ 1e-4` (`λ_min(S) ≥ 1/κ_S` since `S` has a unit
    diagonal). A non-positive eigenvalue of `K̃_DD` that carries coupling, or more than
    240 such directions, is Singular. Checking each node alone misses two soft rotations
    at different nodes that close a mechanism together (Codex's two-node example: each
    node's own check gives `2⁻²⁰`, the joint one `1`).

  The check also runs when every direction is dropped and nothing is kept, so two free
  rotations coupled only to each other are refused too.

  A refusal of either kind has its own reason and wording, not the condition number.
- All block eigenproblems and singular values run on the block divided by its largest
  entry, so scaling a block by `1e±200` neither underflows nor overflows.
- **Singular** if `κ_S · A > R = 1e12`, or `S` does not factor (reason: conditioning).
  The gate is on the product, independent of the applied load. Within each coupling component
  assembly rounds on that component's `μ_max` scale. Its block scaling amplifies this by at
  most `μ_max/μ_min`. Disconnected components have structurally zero transformations between
  them and cannot exchange this rounding (§2.1). The scaled perturbation bound therefore
  remains `‖δS‖ / λ_max(S) ≤ ε A` in the same first-order rounding model, and Weyl's bound gives
  `|δλ_min(S)| / λ_min(S) ≤ ε κ_S A`. The shift here is relative, not an absolute eigenvalue
  bound; operation-count constants are unchanged from the original estimate. At `R` that bound is `2.2e-4`: four digits of the
  smallest eigenpair, and of the displacement it carries, can no longer be guaranteed, and a
  stable and a singular model cannot be told apart beyond that. A mechanism and a near-mechanism are one verdict on
  purpose: which of the two a copy is reported as depends on rounding, so separate verdicts
  were not invariant (measured on the C08 models: `κ_S` of the same model was 2.7e11 in one
  frame and a failed factorization in another).
- With constraints, also retain the nonnegative entrywise envelope
  `H = |C|ᵀ |K_original| |C|`. Absolute values are taken before reduction, so terms that
  cancel in `Cᵀ K_original C` still contribute to `H`. In the local eigenbasis form
  `P = |W|ᵀ H |W|`; its maximum row sum `h` bounds its spectral norm. For this bound,
  dropped directions are included with scale `1/√μ_max,c`. A zero-scale component with
  nonzero envelope is refused. Nonfinite envelopes or projected bounds are refused.
  Require `κ_S h ≤ 1e12` as well as the existing `κ_S A ≤ 1e12`; since the kept `S`
  has unit diagonal, `λ_min(S) ≥ 1/κ_S`, and the first-order error amplification is
  bounded by `ε κ_S h`. This is a conservative entrywise rounding envelope, not a claim
  that constraint reduction can recover precision already lost during assembly.
  The standalone verdict and all constrained solve paths use the same check.
- **Stable**, with its **free rotations** (local free directions that are rotations or
  warping), otherwise.

The spectra of `B` and `S` retain their invariance. The coupling graph also records where
floating-point assembly can mix directions: an exactly axis-aligned copy can have smaller
`A` than a rotated copy. It can solve while the rotated copy is refused, even away from a
threshold. This is intentional: both solved copies must agree, or the uncertain one must
refuse. It never licenses an inaccurate returned answer. The Winkler reproducer checks three
oblique copies against the rotated original displacements and rotations, or requires the
stability refusal. Unit changes and relabelling preserve the structural graph.

### 2.4 Known conservative refusals

Before review round 1, any nonzero off-block coupling of a rounding-level rotation caused
refusal, including a dot product’s own rounding residue. The following are historical
measurements from that implementation, not current refusal guarantees. Round 1 instead
uses the row-wise product bound in §2.3 and keeps the loaded-direction checks active.

| Model | Node | `μ/μ_b` | coupling / `ε √μ_b` | `κ_S` | `A` |
|---|---|---|---|---|---|
| #1090 | 2 | 4.2e-19 | 1.96 | 13.9 | 2.7e4 |
| #1106 | 4 | 2.3e-17 | 0.082 | 7.0e3 | 3.2e4 |
| #1193 | 2 | -1.1e-17 | 1.89 | 13.9 | 7.7e7 |
| #1351, #1352 (one model) | 2 | 8.8e-18 | 1.97 | 13.9 | 2.5e7 |
| #1635 | 2 | -2.2e-18 | 1.11 | 13.9 | 4.9e3 |

A 3D rigid link whose master spins about the link axis (`releaseTEnd` member) is another
model with a frame-dependent conservative refusal. In the axis-aligned frame, the unit systems
and the relabellings the spin moves the slave by exactly zero and the coupling is exactly
zero, so it is Stable with that free rotation. In the three general rotations rounding
leaves a slave motion of `3.2 ε`, `4.1 ε` and `11.5 ε` (below the `192 ε` the map can
settle, so the swing is undecided) together with `μ/μ_b` between `-3.4e-17` and `2.8e-17`
and a coupling of `0.11` to `0.91 ε √μ_b`, and it is Singular. In every frame it is either
that Stable verdict or a Singular refusal for rounding, never a Mechanism. A link offset by
`9e-9` of its length moves its slave by `4.1e7 ε` and is a Mechanism in every frame.
No model of the example, fixture,
feature-matrix or differential corpus is refused by the rule. The vanishing-warping-constant
fixture also has a Stable unloaded axis-aligned spectrum and may refuse oblique copies;
its solve additionally retains the independent Cholesky check. These outcomes are covered
by the transformed-copy tests, including exact zero for every returned unloaded response.

Since slice 2 the linear solves refuse these real, if extreme, structures, measured on the
tests that build them:

| Model | Verdict | Why |
|---|---|---|
| MITC9 twisted strip, 24×8 mesh, `t = 0.0254` and `0.047` (`t/L` about 0.002 to 0.004) | Singular | `κ_S A` = 3.8e10 × 8.4e2 and 1.1e10 × 1.2e3, above `1e12`: thin quadratic shells of this slenderness are refused (MITC4 on the same strip is Stable) |
| Cantilever with `Iy = 1e-10`, `Iz = 1e3` (#1496) | Mechanism | the weak-axis translation is below `1e-12` of the strong one at each node |

For each, the bound cannot guarantee four digits for the weak direction in double precision
(the answer may still be accurate: the bound covers every load, not the one applied); the old
solves returned it with `HighDiagonalRatio` or `NUM-INVARIANCE`, or silently.

### 2.5 Evidence (slice 1, `engine/tests/metamorphic/stability.rs`)

- The 47 C08 reproducers (43 distinct models: #965 and #968 report #964's model, #1041 #1029's and #1352 #1351's) under 4 unit systems, 3 general rotations, 3 quarter turns, 4
  mirrors and 4 relabellings (3D: random rotations, axis permutations, mirrors about each
  axis): every stable or refused verdict, and the number of free directions, is identical.
  Every requested image must build. The only exceptions are listed by model, transform and
  the reason the builder gives; a listed exception that builds, or any other image that does
  not, fails the test. Eight models have no general-angle rotation (#993, #994, #1265: a
  constraint on one translation; #1106, #1118, #1355: a support restraining some rotations;
  #1028: anisotropic springs on a rigid support type; #1357: a support restraining two
  translations) and keep only quarter turns or axis permutations; six have no general mirror
  (the same reasons, #1106 constraints, #1118 a nodal bimoment).
  25 are refused (13 Mechanism, 12 Singular) for conditioning or a free translation, 6
  conservatively for a coupled rounding-level rotation, 16 are Stable.
- The predicted drift `ε κ_S A` matches what the harness measures today: #993
  (`κ_S A = 1.0e12`) drifts 1.4e-4 under units and #1115 (`2.8e12`) 2.9e-4, against a
  prediction of 2.3e-4 and 6.3e-4.
- Of the 13 Stable reproducers whose recorded analysis and relation hold today, all hold;
  6 more are refused conservatively (below) and the other 3 Stable ones (#972, #1099,
  #1647) do not hold today for reasons the verdict does not cover (§5).
- No model of the example, fixture, feature-matrix or differential corpus is refused.
  Of the 117 refused random `fuzz_rich` models, 102 are refused by the linear solver today
  and 14 are solved with `StiffnessNotPositiveDefinite` or `NUM-INVARIANCE`; the last,
  `fuzz_rich_3d/74` (`κ_S A = 7.9e13`), is solved silently today, and the metamorphic
  harness rates every one of its transforms inconclusive.
- A generally oriented stiff frame on springs a million times softer than its members
  (`κ_S A = 3.9e12`) is refused in the tested coupled orientations; on springs a thousand
  times softer it is Stable. Its exactly axis-aligned copy can now solve with `A = 1`;
  rotation that merges its coupling components can instead refuse.

## 3. Refusal policy

- Mechanism and Singular are refusals at every solver entry, before any factorization of
  the system the solver uses, with a diagnostic naming the nodes that carry the
  near-null vector (the converged inverse-iteration vector) and `κ_S`, `A`.
- No entry may shift, regularize or LU-solve its way past a refusal. The PCG and LU
  fallbacks stay only for systems the test called Stable.
- A Singular verdict is never downgraded to a warning: the result would be one of two
  answers, and the test cannot say which.
- The solvers not yet moved to the test keep their warnings (`NUM-INVARIANCE`,
  `StiffnessNotPositiveDefinite`, `CERT-MECHANISM`) until their slice (§5).

## 4. Replacing the artificial springs

A Stable verdict's free rotations are exactly the DOFs the springs exist for (truss-only
nodes, nodes where every member is hinged, torsion-free member ends, warping without
stiffness), now found per direction instead of per global axis. The linear solvers
(slice 2) assemble with the springs switched off (`assembly::without_artificial_stiffness`),
take the verdict on the `K_ff` (or `CᵀK_ffC`) they factor, and then:

1. Pin each free rotation: `K + s v vᵀ` along its direction `v`, with `s` the largest
   eigenvalue of the node block (1 when the block is zero). When `K v` is zero outside the
   block, this is the exact elimination of `v`: the solve gives `vᵀu = vᵀf / (μ + s)`, which
   (2) keeps at rounding, and every other component is the solution of the system without
   `v`. The displacement along `v` is reported as zero.
2. A load with a component along a free rotation (nodal moment, or the end moment of a
   member load) beyond `64 b ε max|f|` is refused before the solve.
3. A free rotation whose `K v` is not zero outside its block (μ above the rounding level, so
   the verdict resolved it, §2.3) is real but soft. After the solve, the force its pin
   carries through that coupling, `Σ (K v)_i u_i`, must cancel to rounding (`64 m ε Σ|(K v)_i
   u_i|`); otherwise the pin held a real response and the result is refused (the hard form of
   `ORPHAN-SOFT-ROTATION`, #1496, which this retires).
4. Cholesky of the pinned matrix must succeed: a Stable verdict with a failing Cholesky is an
   indefinite system that the block test did not see (a negative spring on a coupled
   direction), and it is refused. A negative eigenvalue of a node block, or one of `S` below
   `-64 m ε A λ_max(S)` (the rounding of `S` itself, §2.3; full spectrum only, up to 64 kept
   directions), is already Singular (`Indefinite`). There is no LU, no diagonal shift and no PCG past a failed Cholesky.

The dense LU on a bad sparse residual (3D sparse and PCG paths) stays, as §3 allows: it runs
only on a Stable, pinned, positive-definite matrix. The linear solves no longer warn from
the raw-diagonal ratio, the near-zero diagonal or a round-off pivot (`HighDiagonalRatio`,
`NearZeroDiagonal`, `StiffnessNotPositiveDefinite`), and attach `NUM-INVARIANCE` only from
an `ExcessiveDisplacement` diagnostic: what those tests flagged is now either Stable, with
`κ_S A ≤ 1e12`, or refused. A forward-error warning (`4(n+24) ε κ_S A > 1e-6`) was tried and
dropped: it fired on 24 ordinary corpus models, a plain 20-element cantilever among them.
The other solvers keep the old tests until their slices.

Free motions of the whole model (a model held only by springs that do not reach every
rigid motion) and connector/skew mechanisms are not special cases: they are null vectors of
`S`, hence Singular (Mechanism is reserved for the exact, node-local case).

## 5. Slices

1. `solver/stability.rs`, the verdict and its metamorphic proof on the C08 corpus (this
   slice changes no result).
2. Linear 2D and 3D (dense, sparse, PCG, constrained), including the spring removal and the
   `NUM-INVARIANCE`/`ORPHAN-SOFT-ROTATION` entries it retires (done). Reproducers: the Singular and
   Mechanism C08 models with a linear relation (#993, #1353, #1355, #1651), and #1106,
   whose free rotation is held by no spring in one orientation.
3. P-Delta and the nonlinear tangents that consume `artificial_stiffness_entries`
   (#972, #1090, #1647, #1653).
4. Buckling, modal and time history: the stiffness side of the pencil (#1351, #1352,
   #1362, #1635, #1648).
5. Plastic 2D (#758: every hinge stage is a new `K`; the original-path refusal is lifted
   only when the stage verdicts are invariant) and plastic 3D. Until then plastic 3D solves a
   hinge state that leaves a mechanism with soft springs (`1e-10` of the softest member) at
   every free DOF, through the linear solve with the verdict assumed Stable and the
   artificial springs kept (`stability::assuming_stable`). The assumption occurs only inside
   `carry()`, only after the kinematic check finds an unsolvable hinge state, on its existing
   soft-spring path. Kinematically solvable states still use the ordinary linear gate.

   `balanced()` subtracts the applied nodal loads, rotates member end forces and moments into
   global coordinates and checks their sum at unrestrained frame DOFs against `1e-8` times
   the largest applied nodal or recovered member force/moment. It also evaluates each frame's
   moment diagrams at its far end and requires both bending diagrams to close on the recovered
   end moments within `1e-8` of their force/moment scale. Missing recovered member records are
   skipped, and failure to construct member axes rejects the state. Nodes on plates, quads,
   quad9s, solid shells or curved shells, and nodes with any nonzero physical support spring,
   are skipped by the nodal sum check. All translations of an inclined-support node count as
   restrained in that check; other restrained components follow the support flags. These are
   limits of the check, not guarantees about those omitted forces.

   Previously it returned `true` unconditionally for any model with constraints or connectors;
   those forces are absent from its sums. It now returns `false`, and `carry()` explicitly
   refuses that soft-spring case before entering `assuming_stable`, rather than accepting it
   or mislabelling an unchecked answer as collapse. The regression covers both inputs.

   Force balance and member closure do **not** certify displacement accuracy, uniqueness,
   compatibility of omitted components or the matrix condition bound. Soft-spring hinge-state
   displacements have no accuracy certificate. A failed force/closure check means the state
   cannot carry the loads in this algorithm; it is not permission to return the spring-held
   forces. With the ordinary verdict applied, spring-held hinge states can be Singular and
   read as premature collapse. Extending the matrix certification to plastic states remains
   slice 5; the bypass has not been widened.
6. Staged construction (#1445: its own spring copy; #968, #1091).

Not this test: #1099 (Stable, `κ_S = 5.4`) breaks linear superposition by 12 % on the
sparse path, which no conditioning explains, and #1193 refuses an SSI copy of a Stable
model; both go back to triage.

Each slice carries its reproducers, a results-change registry entry for every model whose
answer becomes a refusal, and states whether an advisory is needed.

## Sparse direct solve accuracy after the gate

A Stable verdict bounds sensitivity to assembly perturbations; it does not prove that a
particular factorization and substitution returned accurate displacement digits. The 3D
sparse Cholesky solve, including the direct fallback after PCG, refines against its original
matrix using compensated residuals that retain product and summation error. Six corrections
must reach `8 ε max(1, ||u||∞)` in the infinity norm of the correction, or the result is
refused. Existing stiffness, residual and pin checks still apply.

The independent 90-digit stored-matrix comparison for the soft-spring model is reproducible
with the [decimal audit script](../results-changes/1753-decimal-audit.py). Run the
`only_just_standing_displacements_match_the_decimal_reference` regression with
`STABILEO_ACCURACY_AUDIT=1 make test.engine.targeted TEST=robustness
FILTER=only_just_standing_displacements_match_the_decimal_reference`, save its output, then
run the script in `make shell` with the log path and an output JSON path. The pre-refinement
relative forward error was `1.2417706258805e-7`; refinement improves the last displayed
sub-micrometre digit on this extreme soft-spring model. The original answer retained seven
correct significant digits and did not warrant a safety advisory.
This refinement is not a certificate for exact unrounded assembly or geometric linearity.
