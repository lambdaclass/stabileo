# Linear stability refusals

Issues #993, #1353, #1355, #1651, #1106, #1496. Slice 2 of the stability test
([docs/solver/stability.md](../solver/stability.md)).

## Linear analysis refuses a mechanism or an unresolvable stiffness

The linear 2D and 3D solves (dense, sparse, PCG, the prepared multi-case path and the
constrained solvers) take the scale-invariant stability verdict on the stiffness they factor,
before factorizing it, and refuse a Mechanism or a Singular verdict, or a stiffness that is
not positive definite. They no longer add the artificial rotation springs (`1e-10 · max
diagonal`), shift the diagonal or fall back to LU after a failed Cholesky. A rotation nothing
stiffens is eliminated exactly; a load on it is refused; a rotation far softer than the others
at its node that the solution loads through its connections is refused (#1496).

What changes for a model:

| Before | After |
|--------|-------|
| Solved with `StiffnessNotPositiveDefinite` (LU fallback or a diagonal shift) | Refused: "the stiffness matrix is not positive …" or "the structure is a mechanism …" |
| Product above `1e12` | Refused if either separate limit fails; otherwise each loaded response must pass refinement and recovered-force equilibrium |
| Solved with `HighDiagonalRatio` and `κ_S A ≤ 1e12` | Same displacements; accepted 3D solves retain conservative raw-diagonal warnings |
| Solved with `ORPHAN-SOFT-ROTATION` (#1496) | Solved exactly, or refused |
| A stable model | Corrected PCG components and sparse direct residual refinement can change stable responses; the legacy bridge has the exact small-component differences recorded below |

`NUM-INVARIANCE` remains attached for an excessive displacement. Accepted 3D solves retain conservative conditioning warnings and original/reduced constrained-stiffness containment.

## Earlier corpus comparison

This comparison records the implementation before conditional admission. The final
loaded-response measurements for this change appear below.

Every model of the example, fixture, feature-matrix and differential corpus (238 linear
solves, 2D and 3D) was solved before (d81653aca) and after:

- None is refused, before or after.
- Every displacement and reaction is bit-identical.
- The only diagnostic change is `ex-three-hinge-arch-input`, which loses `HighDiagonalRatio`
  and `NUM-INVARIANCE`: its hinge rotations are free directions the stability test eliminates,
  and its verdict is Stable.

## Earlier product-gate measurements

These verdict measurements predate conditional admission and do not establish the final
solve/refuse outcome for those loaded models. The conditional rule below supersedes the
product-only refusal interpretation.

These are structures someone could model. Refused cases fail the stability bound for their
weak direction in double precision (the answer itself may still be accurate), and were
returned before with a conditioning warning or none. The axis-aligned #1496 cantilever
solves because its independent directions have separate coupling components:

| Model | Verdict | Why |
|---|---|---|
| MITC9 twisted strip, 24×8 mesh, `t = 0.0254` and `0.047` (`t/L` about 0.002 to 0.004) | Singular | `κ_S A` = 3.8e10 × 8.4e2 and 1.1e10 × 1.2e3 |
| Axis-aligned cantilever with `Iy = 1e-10`, `Iz = 1e3` (#1496) | Stable, solved | independent coupling components; tip rotation agrees with `PL²/2EI` |
| Coupled oblique cantilever with `Iy = 1e-10`, `Iz = 1e3` (#1496), rotated by Euler angles `(0.3, 1.1, -0.7)` | Mechanism | weak translation in a coupled node block is unresolved |
| One-layer solid-shell strip in pure bending, `t/L = 1e-3` | Singular | `κ_S A` = 5.9e12 × 4.3; its test allowed an error of 1e-3 there (its comment measured about 2e-4), against 1e-6 at `t/L = 0.01` |

Thin quadratic shells (MITC9) of that slenderness are refused; MITC4 on the same strip is
Stable and solved as before.

### Coupled directions and verified references

The product `κ_S A ≤ 1e12` is the fast accept; above it, `κ_S ≤ 1e12` and `A ≤ 1e8` permit a conditional solve requiring the a-posteriori checks below. `A` now compares stiffnesses only within connected
coupling components of each node-and-kind block, including transformation coupling that can
cancel out of the assembled off-diagonal entries. Assembly cannot transfer rounding between
structurally disconnected components. Constraint reductions carry the coupling provenance
through their transformation too.

Tests specifically exercising a conditioning refusal now use genuinely coupled fixtures:
`threshold_pair` has a nonzero within-node coupling, and the extreme-stiffness frame,
buckling/bundle and Winkler/staged diagnostic fixtures use a rigid rotation of the same
beam or frame. Their refusal assertions and tolerances are unchanged.

The two axis-aligned Winkler/SSI limit tests now solve with their original assertions;
previously this branch refused them at `κ_S = 3.3e9`, `A = 1.9e4`. Their independent axial
and transverse directions now have singleton components, `A = 1`. Three rotated copies must
agree with the original displacements and rotations to `1e-6` relative, or be refused.
`sh_thin_cantilever_strip_does_not_shear_lock` also passes its unchanged `PL³/3EI` check
(`0.95 < ratio < 1.02`) for MITC4, MITC9, DKT and curved shells. It remains active.

The four shell tests now run main's code and assertions, with no ignore. Their benchmark
meaning is unchanged: Raasch tests measure the existing locked response and convergence,
MITC9 cap checks self-convergence, and MITC4 cap retains `SH-MITC4-DISTORTION` containment.
Passing them does not establish a new published-reference accuracy claim.

### Conditional accuracy above the product fast accept

The correction and recovered-node balance share the accuracy constant defined once in
`stability::CONDITIONAL_ACCURACY`. See [the solver specification](../solver/stability.md#24-conditional-response-accuracy).
Residuals use compensated product and sum accumulation. Existing factors solve the
correction; its norm is evaluated in diagonal energy coordinates, algebraically the
scaled system. The correction is applied once. Failure of either check refuses with the
conditioning reason. Other refusal gates remain active, including the independent
constraint contribution-envelope bound. Shell balances use assembled nodal forces;
frame/truss balances use the actual returned member endpoints.

The canonical physical inputs and their independently assembled 90-digit references are
checked in as [inputs](1753-loaded-c08-inputs.json),
[generator](1753-c08-reference.py), and
[reference responses](../../engine/tests/metamorphic_corpus/1753-accuracy-reference.json).
Run `python3 docs/results-changes/1753-c08-reference.py` within `make shell` to verify
regeneration; `--write` regenerates the reference file. The test requires each canonical
loaded input to match its reference source exactly. The arithmetic operates on exact
binary64 input values, with 90 decimal digits throughout assembly, reduction and solution.
The cubic Hermite torsion/warping element is the model's finite-element interpolation.
Reference responses are transformed from the original model, rather than treating
rounding in transformed coordinates or released axes as a different physical structure.

Final targeted evidence: **398 solved copies**, **2 split outcomes** against each fixture's
original outcome. The `25 / 0.01` unit copies of #993 and #1653 refuse while their originals
solve; every solved copy and every solved pair passes. The worst comparison is
`1.8623288718840833e-7`, below the accuracy constant. There are 23 canonical physical
reference responses. These counts belong to this deterministic loaded probe, not a claim
about all loads or the saved fixtures' recorded non-static analyses.

Each C08 free translation receives an added deterministic nodal component
`(free DOF index + 1) * 1e-6`; original loads remain present. Every supported equivalent
copy runs. Every solved copy must agree with its physical reference and every other
solved copy within the shared accuracy constant. Norms use physical quantity families;
force/moment scales include the largest applied load and its characteristic-length
moment. Zero-load success/refusal differences do not establish wrong results.

The soft-spring bent frame is separately loaded with the recorded small tip forces and
checked against spring equilibrium, member equilibrium and cantilever flexibility. Both
members' force resultants and all node displacements are checked in five unit systems.
No engineering reference values were imported from memory.

New admissions remain **Refs**, not issue closures:

| Issue | Measured κ_S | Measured A | Recorded analysis limitation |
|---|---:|---:|---|
| #973 | 9.59032321013441e10 | 6.29686910234618e5 | Modal mechanism containment remains active |
| #993 | 1.1363591745916341e8 | 9.139854339347761e3 | Original units refusal reproducer stays ignored; no closing claim |
| #1029 / #1041 | 2.177434952691523e11 | 1.6075045114793433e6 | Recorded Winkler/time-history replay remains inconclusive |
| #1115 | 7.88132212097111e7 | 3.610759941472731e4 | Original harmonic replay is measured separately |
| #1357 | 1.115755122698227e9 | 2.5553624577796026e5 | Recorded time-history replay remains inconclusive |
| #1653 | 3.359136066479603e7 | 5.050944657669129e6 | Static loaded-reference check does not close P-Delta accuracy |

The two historical main silent errors covered by SA-2026-054 retain their targeted
constraint-cancellation and independent-PCG-component regressions. No new advisory is
created by this unmerged-branch change.

### Plastic 3D hinge-state force checks

The existing `assuming_stable` scope remains only the kinematically unsolvable soft-spring
hinge-state solve in `carry()`. It has not been extended to other states. The member-force
balance and moment-diagram closure checks certify neither displacements nor the condition
bound. They previously accepted any model with constraints or connectors without checking it;
that soft-spring case now returns an explicit refusal. See stability.md §5 for all skipped
nodes and restraint limitations.

### Safety advisory

[SA-2026-054](../advisories/SA-2026-054-unresolved-linear-stiffness.md) covers results silently
returned on main beyond the matrix precision bound, including `fuzz_rich_3d/74` (recorded
`κ_S A = 7.9e13`). The correct outcome is a refusal, not a replacement numerical answer.
The `linear-stability-refusals` registry entry flags linear analyses for re-checking.

### Test models that were mechanisms

These tests solved a mechanism through the artificial springs; their models now hold the
unloaded rigid or racking motion, and their checks pass against the same references:

- 3D beams pinned with the rotation about their own axis free (`validation_ss_beam_midspan_moment_fz`,
  `validation_zero_moment_axis`, `validation_fixed_vs_pinned_deflection_ratio`): the pin holds it.
- Planar arches and rings whose two supports leave the rotation about the line through them free
  (`validation_curved_parabolic_arch`, `validation_curved_roark_ring_diametral_loads`,
  `capability_vm44_roark_circular_ring`): one support holds it.
- Pratt and Howe trusses with no diagonal in the middle panel: one is added; it carries nothing
  under the symmetric load.
- The 3D truss bridge: unbraced floor, top and cross frames, and supports that left the turn in
  plan free; braced, and the second support at `x = 0` pinned.
- MITC4 plates held out of plane and at one corner (`sparse_3d_parity`, `sparse_3d_benchmark`,
  `sparse_3d_drilling_regression`, `pcg_solver_tests`, `constrained_shell_stress`): a second
  corner is held in `y`.
- The 3D three-hinge arch released its out-of-plane axis (`mz`; local `z` is the global `Z`
  projected off the member), which with pinned supports is a mechanism; it now releases `my`.

Two are mechanisms by nature and now assert the refusal: a parabolic arch of pin-ended bars and a
three-bar cable, both chains whose load is funicular. `#458` (concurrent inclined rollers) is
refused, so its mechanism-fuzz regression no longer carries `knownIssue`.

## Random models no longer certified end to end

Of the 240 random 3D models of `end_to_end_random_3d` (seeds 0 to 119), 19 were certified end
to end before and 17 after. Eleven more are refused; nine of them were not certified before (a mechanism or
a bound the certificate could not give). Two had a certified answer and are now refused:

| Model | Verdict | `κ_S A` |
|---|---|---|
| `random_3d_model(11)` | Singular | 6.8e5 × 1.2e9 |
| `random_3d_model(56)` | Singular | 4.0e9 × 2.0e8 |

The verdict bounds the error of any answer, so it refuses where the certificate, which checks
one answer for one load, can still certify. The sweep now runs seeds 0 to 149 (22 certified)
and keeps its floor of 18.

## In the app

The app gates P-Δ, buckling and modal analysis on the static solve, so a model the static solve
refuses is refused by each of them with the same message:

- A column on a pin free to spin about its own axis under beams released about the vertical
  (the hinged-frame sweep, seed 10) is a mechanism the loads do not excite. It was solved
  before, and modal and buckling named the spin as a discarded mode; all three refuse it now.
- An L-frame (a fixed column with a beam on top, the default section) with every area
  multiplied by 1e4 is Singular (`κ_S A` = 7.0e6 × 9.4e5); by 1e3 it solves as before.


## Review round 1: cancelled contributions and rotational components

Constraint reduction now carries `H = |C|ᵀ |K_original| |C|`, including contributions
that disappear from `Cᵀ K_original C`. Its row-sum bound in the absolute local scaling
basis must satisfy the unchanged `1e12` precision gate together with the scaled condition
bound. Both the standalone verdict and the dense/sparse 2D and sparse 3D constrained
solvers use this envelope. A nonfinite bound refuses.

The regression ties two axial DOFs with a unit-length member of axial stiffness `1e16`
and a support spring of stiffness `3`, under axial force `1`. Assembly stores `M + 3`
as `M + 4`, and reduction leaves `4`; the physical member does not extend under the tie,
so the analytical displacement is `1/3`. The envelope retains approximately `4e16`,
instead of judging the reduced scalar by itself. The fixed solver refuses this case;
the same test with member stiffness `1e8` solves and checks `1/3` within `1e-9`.

A detached test-only worktree at main `8f4c3ee6c` refused the minimal 3D example at its
final force-balance self-check (`1.429e-1 > 1e-3`). Adding an independent load `fz = 1e6`
at a fully restrained third node changed that outcome: main returned `ux = 0.25` at both
axial nodes, **25% below `1/3`**, with zero reduced residual and a PASS force-balance
self-check (`1.2499989062509567e-7`, below its `1e-6` warning threshold). All four structured
diagnostics were informational. The independent load masks the axial error in the aggregate
balance measure. The new load-independent gate refuses both versions before factorization.
The [recorded main probe result](1753-main-constraint-cancellation-probe.json) retains the
returned values and diagnostics. This extends [SA-2026-054](../advisories/SA-2026-054-unresolved-linear-stiffness.md).

Free-direction classification now diagonalizes each structural coupling component and uses
its own largest eigenvalue with the unchanged `LOCAL_FREE = 1e-12`. Two independent
rotational springs of `1e13` and `1` no longer turn the weaker spring into a free direction;
a moment `2` gives the signed rotation `2` in regular and prepared solves.

Off-node coupling uses the rounding bound `64 b ε Σ_j |K_ij v_j|` for each row of `K v`.
It discards only the rounding residual of those actual products. The oblique released
cantilever regressions verify the signed axial displacement components `F L / E A` in
regular and prepared solves, and still refuse a torsional moment on the released direction.
A small genuine single-product coupling cannot disappear under an unrelated stiffness scale.

The analyzed sanity review of the soft-supported building is restored: it retains the
accurate-displacement reference and requires `DisplacementAbsurd` at `Severity::Error`.
The settlement regression uses the signed analytical rotation `ry = -1.5 dz / L`.
The existing `linear-stability-refusals` registry entry includes these result changes.

The component fix also changes the axis-aligned settlement case with `Iy = 1e-10`: the
independent weak rotation now solves in regular and prepared paths and must match the signed
`-1.5 dz / L` reference at the existing `1e-9` relative tolerance. The original 3D rich seed
`20761` now has a Stable unloaded stiffness verdict, while its loaded released rotation
still explicitly refuses. No assertion accepts a returned inaccurate value for that seed.

The C08 unloaded verdicts for #1090, #1106, #1193, #1351, #1352 and #1635 change from
`CoupledSoftDirection` to `Stable/Resolved`, with one free rotation. Their linear replay
checks retain no failed comparisons, but five are inconclusive under the certificate harness;
#1106 explicitly refuses a loaded free rotation. The nonlinear tangent, modal completeness
and time-history refusal differences in the original C08 analysis rows remain pending; this
change does not certify those later solves. In particular, the original #1090, #1352 and
#1635 rows can still report a transformed-copy refusal. Their previous conservative static
refusal had masked those later outcomes.

The synthetic coupled-direction tests now distinguish a genuinely free rotation from a
small positive independent spring. The positive fixture with two rotational diagonals
`2e-20` has a resolvable scaled condition number `9` and is required to remain Stable;
the zero-diagonal version must still refuse its genuine off-node coupling. The vanishing
warping-constant fixture retains its unit/relabel spectrum checks, checks every returned
unloaded displacement and warping value against exact zero, and accepts only the explicit
stability/factorization refusals for copies that cannot be factored. The original copy
still explicitly refuses at factorization. No tolerance or numerical reference is relaxed.

The #1465 load-session test now sends the original moment through `solve_loads`, requiring
the same node-and-direction refusal as the regular solve. Session construction prepares an
unloaded stiffness and can now succeed for that valid released system; it supplies no result
until loads are applied.

`tiny_rotational_spring_beside_stiff_ones_at_a_released_node_3d` now requires all three
signed rotations to equal `M/k`, including the independent `1e-13` spring, at the existing
spring tests’ `1e-9` relative tolerance. Its prior loaded-rotation refusal was false: each
released member rotation has its own actual support spring. The exact result and the
certificate variant are checked explicitly.

The #1496 masking regression keeps its unchanged `1e-6` analytical rotation check on every
returned result. It additionally requires every axis-aligned load/unit variant to solve and
every refusal to have an unloaded stiffness refusal. Its previous all-frames-equal boolean
expectation is replaced by the actual precision contract: coupled oblique copies may refuse,
while every returned copy must satisfy the same numerical reference.

## CI follow-up: arch warnings and registry applicability

The `2d-three-hinge-arch` snapshot had one changed leaf, a diagnostic string:

```text
base.diagnosticCodes
before: warning:high_diagonal_ratio warning:instability_risk warning:known_issue warning:known_issue
after:  warning:instability_risk warning:known_issue
```

There is no numerical snapshot delta. The removed `known_issue` is the conditioning
`NUM-INVARIANCE` warning. `bb0c9d158` removed the old conditioning warnings from the
linear paths and eliminated the crown's unloaded free rotation exactly; the arch is Stable.
The retained warnings still identify the unloaded rotation and the arch's other known issue.
This small 2D model uses dense Cholesky, so the sparse 3D compensated residual refinement
in `31036c961` does not run here. The component changes in `31036c961` and `0d3a5d892`
are not the source of these removed warnings.

Independent equilibrium gives `V_A = V_B = 70 / 2 = 35 kN`. Taking moments of the left
half about the crown gives `H = (35 × 5 − 10 × (3.75 + 2.5 + 1.25)) / 4 = 25 kN`.
The seven nodal loads are funicular for the eight straight segments: their transverse
forces and end moments are zero, as the new engine regression checks within `1e-9`.
It reads the fixture rather than copying its engineering inputs and checks both reactions
before checking the snapshot's warnings.

The independent 90-digit Decimal audit in [1753-arch-audit.py](1753-arch-audit.py) also
computes the signed displacements from member axial shortening and compatibility at the
crown, without assembling or solving an engine stiffness matrix. The app loads its default
IPN 300 as a canonical section; `solverProperties(modelStore.sections.get(1))` reports
`A = 0.0068998265206363625 m²` (digest `2e2ce7e8b642417c`). Using the fixture's rounded
`0.0069 m²` instead would compare a different section. With the actual area:

```text
make shell
python3 docs/results-changes/1753-arch-audit.py --area 0.0068998265206363625 web/results-snapshots/2d-three-hinge-arch.json
```

The crown reference is `uz = -0.0002576464407492406375… m`; the left-half rotation is
`ry = -0.000030122320385270117386… rad`. The stored snapshot's largest absolute errors
are `2.385e-15 m` in `ux`, `4.925e-14 m` in `uz` and `4.730e-15 rad` in `ry`; its stored
reaction error is zero. The fresh capture has the same stored numerical values. The audit
keeps its `1e-9` absolute checks. No numerical baseline, tolerance or assertion is loosened.

Only this snapshot was regenerated, through the documented npm regeneration path:

```text
make shell
cd web
npm run snapshots:update -- src/lib/results-snapshot/__tests__/snapshot-basic.test.ts -t '^2d-three-hinge-arch$'
```

The `linear-stability-refusals` fragment requires only `analysis:linear`. Every saved
project with a previously accepted linear result receives the re-check notice, including
ordinary legacy truss and shell models. Model features cannot establish stability or detect
plain frame, truss and cable mechanisms. A feature set without a linear analysis remains a
non-match. This conservative notice does not assert that every flagged result is wrong;
re-run the fixed solver to establish whether a result is accepted or refused. The engine
checks every linear stiffness. The shell precision refusals and SA-2026-054 documented
above remain in force. This follow-up changes no solver code and discovers no additional
wrong engineering result requiring another advisory.

## Review round 2: unrelated moments and alternate load cases

The free-rotation load projection and pin verification now bound rounding using only
terms that contribute to the projected direction. A moment on an independent stiff axis
cannot enlarge the allowance on a free axis. The load projection keeps its existing
`64 n ε` multiplier and uses `max |v_i F_i|`; pin verification sums the absolute applied,
restrained and coupling products, with its existing multiplier. Both bounds tighten;
no tolerance increases. The load refusal runs before a pinned solve, and the pin check
still independently rejects an artificial pin carrying a load. Verification of the pinned
matrix alone cannot establish equilibrium in the original unsupported direction.

Four ignored regressions were committed before the implementation fix, each marked
`known wrong result: #1753`, and all four failed when forced to run. The matrix fixture
has rotational stiffness `diag(1e20, 1, 0)` at one node and loads `[1e20, 0, 1]`.
Before the fix, `load_on_free_rotation` returned `None`, and `check_pins` accepted the
unit moment in the free direction. After the fix, both reject it. The zero projection
and an exactly balanced applied/restrained projection remain accepted.

The end-to-end fixture grounds two nodes and connects the third by a unit-length frame
whose end bending rotations are released. Its independent rotational support springs
are `krx = 1e20` and `kry = 1`, with no `krz`. The applied moments are
`[1e20, 0, 1]`. At the pre-fix head the dense solve returned `rz = 1`, with no physical
z-axis moment reaction, and informational diagnostics only. Its static residual and balance
checks reported PASS. There is no finite static equilibrium for the unsupported unit
moment; the correct result is refusal. Regular and prepared dense, sparse direct and PCG
paths now require that refusal, naming node 3 and its rotation.

Preparation no longer assembles or checks `input.loads` against free directions. It
prepares the load-independent stiffness; `solve_loads(loads)` checks the actual supplied
case on every call. A default unsupported moment no longer prevents preparing a valid
alternate case. The regression prepares that model, solves an alternate case, refuses
the default case, solves an empty case, and repeats the alternate case. It checks signed
rotations against the spring/member equilibrium without relaxing its `1e-12` checks.
The dense fixture has three nodes; adding fully restrained nodes brings the total to
twelve and selects sparse direct or explicitly requested PCG with the same free DOFs.

The PCG alternate-case assertion also exposed a second masking problem: with alternate
moments `[1e20, 2, 0]`, the default shifted-IC attempt returned
`ry = 1.999999999998461e-14` instead of the spring equilibrium `ry = 2`.
The aggregate relative residual could accept the missing independent moment. PCG now
also requires each row residual to be within the existing `1e-6` threshold times
`|F_i| + Σ_j |K_ij u_j|`. A failed row check uses the existing preconditioner/direct
fallback chain. The aggregate check remains required. This additional check applies to
both 2D and 3D callers of the shared PCG helper.

The existing `linear-stability-refusals` registry entry records these changes, within its
unchanged feature applicability. The extreme-ratio branch regressions above establish the
need for the tighter checks; they do not establish an affected main deployment. The main
probe below supplies the separate evidence for extending SA-2026-054. The change is local
and is not a deployment claim.

The linear refusal metamorphic helper now requires every selected transformation to
succeed and asserts its exact named variants. #1651 must exercise rotation and all three
plane embeddings. #1353 must exercise an arbitrary 3D rotation and an axis permutation.
#993 has a single-axis constraint, so its required rotation is a quarter turn; all three
unsupported plane embeddings are explicitly required to fail with the constraint-embedding
reason. #1106 and #1355 have partial rotational supports, so their two required rotations
are representable axis permutations. These restrictions already appear in the corpus
transformation exclusions. No failed required transformation can disappear from the test.
The differential rigid-body helper now panics on any solver error except its expected
mechanism refusal, so a negative warning assertion cannot pass on an unexpected error.


### Advisory review: realistic load ratios on main

A detached, test-only worktree of `origin/main` at `8f4c3ee6c07c661c090865f7390d10b78162786f`
was probed and removed. The [probe source](1753-main-load-ratios-probe.rs) appends to main's
`known_issues.rs` and uses its existing imports and `common::make_3d_input`. Run only
`known_issues::issue_1753_main_realistic_load_ratio_probe` in the `robustness` binary through
`make shell`; it writes `probe.json`. The [recorded evidence](1753-main-load-ratios-probe.json)
retains representative full inputs, every outcome, the signed rotations, aggregate checks,
warning diagnostics, and full diagnostics for the silent failures described below.

The main probe uses moments of `1000` and `1000 / R`, where `R` is `1e3`, `1e6`, `1e7`,
`1e8` or `1e9`. Independent rotational springs are `krx = 1e6` and `kry = 1e6 / S`,
with `S` equal to `1`, `1e3`, `1e6` or `1e9`. A connected chain of twelve nodes selects
sparse/PCG; every node except node 3 is fully restrained. Adjacent member bending releases
leave node 3's y rotation supported only by its spring. The PCG case also supplies
`krz = 1e6`; the free-rotation case supplies no z spring and loads that unsupported rotation.
The latter was also tested with three nodes for dense analysis. Both regular and prepared
paths were probed, for 200 small solves total.

Every loaded free-rotation case refused on main at all five load ratios, identifying the
unsupported moment at node 3. The `1e20` branch masking example therefore does not establish
a realistic silent main failure, and warrants no separate advisory.

For PCG, the default shifted-IC preconditioner preserved the small component with `S = 1`
and `S = 1e3` at every tested ratio. Explicit `preconditioner = "none"`, with the unchanged
default iteration tolerance `1e-8`, did not. The y-axis equilibrium is independently
`ry = My / kry`; adjacent member releases supply no y-axis moment stiffness.

| Load ratio `R` | Spring ratio `S` | Expected `ry` | Returned `ry` on main, PCG `none` | Warning/error diagnostics |
|---|---|---|---|---|
| `1e3` | `1` | `1e-6` | `1e-6` | None |
| `1e6` | `1` | `1e-9` | `1e-9` | None |
| `1e7` | `1` | `1e-10` | `9.999999999999999e-11` | None |
| `1e8` | `1` | `1e-11` | `1.2833168805528135e-13` | None |
| `1e9` | `1e3` | `1e-9` | `1.283316880552813e-14` | None |

`1e8` is the smallest probed load ratio with a wrong component and no warning, not a
universal onset threshold. No silent failure was found at `1e3`, `1e6` or `1e7`. At `1e8`,
`S = 1`, the returned rotation is about 98.72% below equilibrium. Main reports solver path
`pcg_none`, one iteration, aggregate relative residual `9.871668311944719e-9`, a PASS static
residual of `8.714121303486764e-8`, and zero aggregate balance error. All four structured
diagnostics and the solver diagnostic are informational. Regular and prepared results agree.
The `1e9`, `S = 1e3` case is about 99.9987% below equilibrium, also without a warning.
The larger spring contrasts sometimes warn or refuse; those are recorded but do not support
the silent-result claim. Default shifted-IC is not claimed to fail in either silent example.

The regression `issue_1753_pcg_resolves_each_independent_moment_with_disparate_loads` uses
these five load ratios, both `S = 1` and `S = 1e3`, regular/prepared paths and default/none
preconditioners. It fails on main at `R = 1e8`, `S = 1`, `none`, and passes with the accepted
row-residual verification. Its signed spring-equilibrium check uses relative tolerance
`1e-12`, so a small absolute response cannot hide a missing component. No tolerance or
assertion was relaxed. This measured main failure extends
[SA-2026-054](../advisories/SA-2026-054-unresolved-linear-stiffness.md); SA-2026-055 is removed.


### Final review: bounded Lanczos acceptance and restored fixture checks

The final-round regression constructs a symmetric matrix with a leading block
`[[2.0005, -0.0005], [-0.0005, 2.0005]]` and the remaining diagonal entries
`1 + i / (10 m)`, for `m = 80`. Its largest eigenvalue is `2.001`, in the
antisymmetric direction of that block. Seed `15233338564176581173` gives exactly
equal first two starting components, making that direction absent from the Krylov
subspace. The old helper accepted `2.0000000000000004` after two successive checks
at iterations 10 and 20. Agreement between estimates does not bound the largest
eigenvalue, and even a small residual could describe the wrong eigenpair.

`lanczos_top` now returns only after its caller certifies an upper bound. For the
stiffness, Cholesky of `u I - S` must succeed. For the inverse stiffness, Cholesky
of `S - l I` must succeed, and `1/l` bounds the inverse's largest eigenvalue.
The existing certification margin, widening limit, seed count and precision
product gate are unchanged. Stall and iteration exhaustion select when to try
certification; neither can bypass it. The regression also exercises a two-entry
Krylov breakdown. A separate hidden-eigenvalue case whose certificate cannot be
obtained within the existing widening budget must return `None`.

The earlier `spectrum` already applied these Cholesky certificates after obtaining
raw Ritz estimates. This patch moves that requirement into the helper's acceptance
contract. It does not demonstrate a formerly accepted unsafe user solve; no new
advisory is justified by this helper regression. The existing registry entry and
SA-2026-054 continue to cover the independently demonstrated main failures.
Reciprocal multiplication can change the last rounded bit of the condition-number
diagnostic compared with the former upper/lower division. The matrix precision
threshold is unchanged.

The Q9 cap again compares its solved 4x4 and 8x8 meshes with the original `> 0.80`
self-convergence assertion. The 16x16 refusal stays required. The solved Raasch
meshes retain the original numeric floors, and the MITC4 solved mesh also retains
the original upper capability bound. The 32x32 MITC4 cap now independently asserts
the full registered `SH-MITC4-DISTORTION` containment identity through the distorted
model preflight, as well as requiring the linear solver's conditioning refusal.
The preflight code assertion does not pretend that the linear conditioning error
is the distortion diagnostic: the matrix gate runs before the response-based
membrane-bending guard on this mesh.

The deformation test restores the original axial multiplier `1e5` and the original
accuracy assertion. The unit-invariance helpers require every compared displacement
component to be finite. The NaN reproducer used to pass its inner comparison; now
all six injected nonfinite components are rejected. An empty prepared load case
must contain every expected node exactly once, with all six components zero.

#### Truss fixtures: mechanisms and independent signed forces

Both original two-dimensional fixtures lack the middle-panel diagonal. A nonzero
admissible motion is `ux = -z`, with `uz = x` for the left end block and `uz = x-12`
for the right. It has exactly zero first-order extension in every original member
and zero restrained support motion. Both original fixtures are therefore genuine
mechanisms, independently of their solver refusal. Adding member 13 removes that
mode. The tests are renamed for three-panel trusses with upward/downward end
diagonals; they no longer claim the former Pratt/Howe pattern.

[The independent calculator](1753-truss-reference.py) solves all joint equilibrium
equations with rational arithmetic. With the fixtures' two downward loads of 30,
it gives these signed tension-positive forces in member-id order:

| End diagonals | Members 1 through 13 |
|---|---|
| Upward | 40, 40, 40, 0, -40, 0, 0, 0, 0, 0, -50, -50, 0 |
| Downward | 0, 40, 0, -40, -40, -40, -30, -30, -30, -30, 50, 50, 0 |

For the original bridge supports, rigid yaw has displacement
`u = (-(y+1), x, 0)`. It is nonzero, stretches no original member and respects every
restraint. It remains a mechanism after adding the braces if node 5 keeps its
longitudinal roller. The tests prove both variants and require their refusal.
The pinned-node-5 and cross-braced fixture stays, under an explicit name.

The same calculator independently assembles axial compatibility and solves it at
70-digit Decimal precision with uniform `EA = 1`; the common axial stiffness scale
cancels from the member forces. It asserts free-joint equilibrium residuals below
`1e-50`. Its [recorded output](1753-truss-reference.json) contains all 54 signed
member forces and support reactions. The bridge test checks all of them using the
existing 1% relative and `1e-6` absolute force tolerances. For example, members 1
and 4 each carry `0.2310880534869431`, and the transverse reactions at nodes 1 and 5
are opposite `1.6274824297717988`. Their longitudinal reactions are zero for these
symmetric vertical loads. These values are computed references, not snapshots of
engine output. Reproduce with `make shell` and run
`python3 docs/results-changes/1753-truss-reference.py`.

All other findings from the final review are tracked in
[#1891](https://github.com/lambdaclass/stabileo/issues/1891), assigned to
unbalancedparentheses and Batuis with label `cause:C`.

### Load-session retry and final wording corrections

A 3D load session first prepares with the initial loads removed. Its fallback used
`Result::err().unwrap_or(original)`, which discarded a successful loaded retry and
returned an error in either case. The fallback now retains the loaded preparation
on success and returns the original error if that retry also fails. No numerical
result is replaced by this correction: a previously discarded preparation is retained.
The two `load_session::tests::issue_1753_*` regressions inject the initial failure;
the success case then prepares the real `cantilever-3d-input.json` fixture and checks
its displacements, reactions and member forces against the ordinary loaded solve.
No natural model whose unloaded preparation fails and loaded preparation succeeds
was identified: stiffness preparation is load-independent after validation.

The #1496 table above records the actual component-based outcomes. The masking
regression returns tip rotation `0.024999999999999988` against `PL²/2EI = 0.025`
for the axis-aligned cantilever, including a separate stiff part. Its copy rotated
by Euler angles `(0.3, 1.1, -0.7)` is refused as a Mechanism; an axis permutation
still solves. Stable does not imply bit-identical historical responses: the PCG
component correction measured above and sparse direct residual refinement can
change displacements. The recorded corpus comparison has that narrower scope.

### Final capped review: negative node stiffness and empty-model notices

The rotational block `[[1e20, 1], [1, -1]]` has negative energy for the
second coordinate direction. The component-wide negative-eigenvalue tolerance
could nevertheless accept its negative eigenvalue as rounding, drop it as a free
rotation, and pin it. Coupling checks considered only directions outside the
node group, so they did not reject this block.

Each diagonal is now checked before decomposition using only that entry's
magnitude, or its own constraint-reduction magnitude bound. A resolvably negative
diagonal gives `Singular / Indefinite`, with no pin. A remaining negative
rotational eigenvalue is refused unless explicit member releases establish zero
physical stiffness along that direction. The proof checks the unreleased local
rotational axes of every incident frame and rotational support springs, and
follows the constraint transform. Nodes with connectors or shells do not receive
this release exemption. Translation mechanisms still report `Mechanism`; a
negative rotational mode cannot be accepted merely because its off-node coupling
is absent. The matrix and load tolerances are unchanged.

The three new `solver::stability::tests::issue_1753_*` regressions failed before
this fix and pass after it. The block is embedded using actual 2D and 3D DOF tags:
2D has two translations per node and one rotation, so its two-coordinate block is
translational and previously reported `Mechanism / FreeTranslation`. The 3D
rotational embedding previously reported `Stable / Resolved` with a pin. A
positive-diagonal block `[[1, 1 + EPSILON], [1 + EPSILON, 1]]` separately proves that
an unresolved negative rotational eigenvalue cannot be assumed to be a release.

An archived copy of `origin/main` at `87e1c9a1b` was built inside this worktree and
run on the same matrix and two public-solver models. The matrix analyzer reported
`Mechanism` in 2D and `Stable` in 3D. Both public linear solvers returned `Ok` on
models with negative connector stiffness. The 2D solve warned about indefinite
stiffness and LU fallback. The 3D solve added artificial rotational stiffness and
warned `HighDiagonalRatio`, `NUM-INVARIANCE` and `ORPHAN-SOFT-ROTATION`. Its node-2
y rotation was `-1.0000000000999999e-30`; the unmodified physical rotational block
requires `+1e-20` under the supplied unit x moment. Both fixed solves refuse the
negative diagonal at node 2. This is a warned main failure, not evidence of a
silent deployment failure.

[The evidence](1753-negative-stiffness-probe.json) records both full inputs and
main/fixed outcomes. [The probe](1753-negative-stiffness-probe.rs) takes paths to
the 2D and 3D inputs extracted from the evidence. To repeat inside `make shell`,
copy it temporarily to `engine/examples/final_negative_probe.rs` and run
`cargo run -p dedaliano-engine --example final_negative_probe -- <2d.json> <3d.json>`.
Run the same probe against an archived copy of main inside this worktree for the
comparison. Temporary probe source is not part of the engine build.

The existing `linear-stability-refusals` registry entry retains its all-linear
scope and now requires any of `members`, `shells`, `connectors` or `springs`.
Supports and nodal loads alone establish no stiffness elements and no linear
result to re-check. The reported 3D steel-truss applicability test is unchanged.


### Final two fixes: release alignment and exact numerical explanations

A single negative rotational eigenmode could fail the physical release proof and
then be replaced by any permitted release direction at that node. The replacement
was never projected against the eigenvector. The mode was recorded as free and
omitted from `unresolved_negative`, allowing `Stable / Resolved` and a pin even
when the release did not span it.

The replacement now uses its normalized direction `r`, computes `a = v·r`, and
checks the residual `||v - a r||`. Its rounding bound includes dot-product rounding
and eigenvector uncertainty: the existing block spectral rounding bound divided
by the separation from the other eigenvalues, with twice the spectral rounding
subtracted from that separation. An unresolved separation or a bound of at least
one cannot certify the projection. The physical `permits` proof is still required.
A failed projection leaves the mode in `unresolved_negative`, so it refuses with
no pin. Existing tolerances are unchanged.

The two new `issue_1753_negative_rotation_not_spanned_by_release_{2d,3d}` tests
use two- and three-coordinate rotational blocks. These are local block dimensions,
not a claim that a planar node has two rotations: the production 2D path has one
rotation per node and no canonical release fallback. The upper-left block is
`[[1, 1 + EPSILON], [1 + EPSILON, 1]]`; the three-coordinate case adds an independent
positive unit entry. Only the first coordinate is released. The negative mode
mixes the first two coordinates, so both cases must refuse. Both returned Stable
with a pin before the fix; both now return Singular with a refusal and no pin.
The companion test keeps a release aligned within rounding accepted in both block
dimensions. The existing #1193 oblique release and all its tested transformed
copies remain stable under the eigenvalue-separation projection bound.

The registry's unscoped quantity is now only `solve.ok`. Its applicability still
covers every linear result with stiffness elements. Neither forces, reactions nor
displacements of an arbitrary successful solve are explained by this notice.
The original real-corpus negative judge tests use the complete assessment without
filtering entries: the fabricated truss force and shell displacement now give
`unexplained`, while the independently registered shell stress correction remains
explained.

Removing `*` also exposed historical bridge round-off changes in all three legacy
versions. The [measured evidence](1753-refinement-corpus-evidence.json) records
372 changed `displacements.rz` components and 24 changed `reactions.mz` components
across the response sets. The maximum absolute recorded rotation changes from
`3.146652157e-15` to `5.264728212e-16`, and the maximum absolute recorded reaction
moment from `3.082446808e-14` to `3.215494178e-15`. These are the sparse direct
response's small-component changes, consistent with the documented refinement;
this measurement does not isolate refinement from every other change in #1753.
The earlier bit-identical corpus report above describes the earlier comparison,
not these historical-release captures.

Only these two fields receive scoped quantity declarations, each requiring the
exact SHA-256 fingerprints of both complete gated responses. The evidence names
the source corpus files; v0.3.0 and v0.4.0 share a fingerprint. Altering any gated
value on either side invalidates the numerical scope. Thus even another change
in a bridge rotation or reaction moment is not automatically explained. The
fingerprint checks retain all current numerical tolerances and historical files.
The synthetic judge test also alters a declared field, an unrelated force and a
displacement on each side, and requires an unexplained verdict in every case.
The real bridge test repeats this on recorded rotations, displacement, reaction
moments and member force, changing the history and current response separately.
A separate test verifies every historical source fingerprint against the untouched
corpus file named in the evidence.
PCG's documented independent-component correction remains verified by
`known_issues::issue_1753_pcg_resolves_each_independent_moment_with_disparate_loads`;
it receives no blanket numerical allowance for other saved models.

Reproduce the local checks with `make test.engine.targeted TEST=metamorphic
FILTER=stability::`, `make test.engine.targeted TEST=robustness FILTER=issue_1753`
and `make test.web.unit UNIT_AREA=legacy-projects`. The library-level regressions
run through `make shell` with `cargo test -p dedaliano-engine --lib
solver::stability::tests -- --nocapture`.

This canonical-release substitution belongs to the unmerged #1753 branch. No new
advisory is introduced by this follow-up.


### PR #1753 CI: declare the arch diagnostic quantity

The rebuilt WASM preserves every committed numerical value of
`web/results-snapshots/2d-three-hinge-arch.json`. Against `origin/main`, the only
changed field is `base.diagnosticCodes`: `warning:high_diagonal_ratio
warning:instability_risk warning:known_issue warning:known_issue` becomes
`warning:instability_risk warning:known_issue`. The removed diagnostics are the
raw diagonal ratio of the former artificial crown-rotation stiffness and its
conditioning NUM-INVARIANCE warning. Exact elimination of that unloaded free
rotation makes those two warnings obsolete; the instability-risk and other
known-issue warnings remain. This is the diagnostic change already described
above, independent of the separate 3D hinge test refusal.

The unmerged `linear-stability-refusals` entry now declares `diagnosticCodes`,
so the snapshot applicability gate can account for this change. Regenerating
with `make snapshots-update` leaves the committed snapshot unchanged. No
numerical baseline, accuracy threshold or warning assertion is relaxed.
