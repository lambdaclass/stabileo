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
| Solved with `HighDiagonalRatio`, `NearZeroDiagonal` or `NUM-INVARIANCE`, `κ_S A > 1e12` | Refused as Singular, naming the nodes |
| Solved with `HighDiagonalRatio` and `κ_S A ≤ 1e12` | Same displacements, without the warning |
| Solved with `ORPHAN-SOFT-ROTATION` (#1496) | Solved exactly, or refused |
| A stable model | Same displacements and reactions |

`NUM-INVARIANCE` is attached by the linear solves only for an excessive displacement.

## Corpus

Every model of the example, fixture, feature-matrix and differential corpus (238 linear
solves, 2D and 3D) was solved before (d81653aca) and after:

- None is refused, before or after.
- Every displacement and reaction is bit-identical.
- The only diagnostic change is `ex-three-hinge-arch-input`, which loses `HighDiagonalRatio`
  and `NUM-INVARIANCE`: its hinge rotations are free directions the stability test eliminates,
  and its verdict is Stable.

## Real structures now refused

These are structures someone could model. Each is refused because the stability bound cannot
guarantee four digits for its weak direction in double precision (the answer itself may still
be accurate), and each was returned before with a conditioning warning or none:

| Model | Verdict | Why |
|---|---|---|
| MITC9 twisted strip, 24×8 mesh, `t = 0.0254` and `0.047` (`t/L` about 0.002 to 0.004) | Singular | `κ_S A` = 3.8e10 × 8.4e2 and 1.1e10 × 1.2e3 |
| Cantilever with `Iy = 1e-10`, `Iz = 1e3` (#1496) | Mechanism | weak-axis translation below `1e-12` of the strong one |
| One-layer solid-shell strip in pure bending, `t/L = 1e-3` | Singular | `κ_S A` = 5.9e12 × 4.3; its test allowed an error of 1e-3 there (its comment measured about 2e-4), against 1e-6 at `t/L = 0.01` |

Thin quadratic shells (MITC9) of that slenderness are refused; MITC4 on the same strip is
Stable and solved as before.

### Coupled directions and verified references

The product gate remains `κ_S A ≤ 1e12`. `A` now compares stiffnesses only within connected
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

The following tests do **not** verify a published reference on main. Their remaining refused
meshes now assert the stability refusal, with test names and messages identifying them as
ill-conditioned models, not verified references. Coarse meshes retain their original nonzero
response checks or their existing containment:

| Test | What main actually checked | Refused meshes |
|---|---|---|
| `benchmark_raasch_hook` | A nonzero-response floor, coarse convergence, and a finest ratio between `1e-8` and `100`; its comment records about `0.0001` of the published reference | MITC4 16×8, 24×12 |
| `benchmark_q9_raasch_hook` | Positive displacement and finest ratio above `1e-6`; its comment records about `0.0001` of the reference | MITC9 8×4, 16×8 |
| `benchmark_q9_spherical_cap` | Self-convergence to its own 16×16 mesh, without a published displacement | MITC9 16×16 |
| `benchmark_spherical_cap_self_convergence` | All meshes already expected `SH-MITC4-DISTORTION` on main | MITC4 32×32, now caught earlier by stability; smaller meshes retain the distortion refusal |

These claims were checked against `origin/main` after the merge. The Raasch comments describe
severe locking; they are not evidence of reference accuracy. No tolerance, baseline or
published-reference assertion was loosened.

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
