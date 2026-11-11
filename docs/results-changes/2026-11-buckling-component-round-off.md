# Buckling round-off bounds follow actual constraint coupling (2026-11-11)

Issue [#1756](https://github.com/lambdaclass/stabileo/issues/1756). Registry entry: `buckling-component-round-off`.

The axial-force round-off bound used by 2D and 3D buckling previously merged every free DOF into one component whenever the input contained any constraint. A constraint wholly inside one disconnected structure therefore let its force scale suppress a resolved compression in another structure. This produced a refusal, not a silently wrong factor.

The shared component calculation now joins free DOFs through the assembled stiffness pattern, each member's DOFs, inclined-support coordinate transforms, and rows sharing a nonzero column of the actual free constraint transform. The last rule uses the same `FreeConstraintSystem` that reduces the buckling eigenproblem, including resolved constraint chains and all constraint kinds. DOF enumeration comes from `DofNumbering::element_dofs`, including warping when present. Restrained DOFs do not join independently moving structures. Each component receives only its own members' largest axial-force recovery bound; a member with no free DOFs keeps its own bound.

The multiplier `100 ε`, compression comparisons, omitted-member worst-compression check, eigenvalue cutoff and mode-resolution threshold are unchanged. Assembly, the omitted-member check, unresolved-mode diagnostics and element buckling data all use the resulting `axial_noise` map. Both certificate entry points obtain their matrices from the same buckling-system builders. The WASM exports call these native implementations. P-Delta and corotational analyses do not consume this bound; their separate-member controls remain covered.

## Reference and observed change

The exact F probe input is archived under `1756-true` in the read-only cause-C replay worktree's `docs/verification/cause-c-replay-2026-11-11.json`. The corresponding separate-member control is `1756-false`. The temporary F probe code was removed in that worktree; its report and serialized inputs remain. The permanent reproducer uses the same independent column and tie, with the local MPC `u3z = u4z` inside the tie.

The independent reference is the smaller root of the one-element cantilever pencil, derived in the existing buckling controls:

`λ = (5.2 − √19.84)/0.3 · EI/(L² P)`.

The checked-in model supplies `E = 200000 MPa`, `I = 1e-12 m⁴`, `L = 10 m`, and `P = 1e-9 kN`. The expected factor is `4971.923398239883`; the original unconstrained replay returned `4971.923398239881`. The regression retains its relative tolerance of `1e-6`.

| Model / entry points | Before | After |
| --- | --- | --- |
| Exact #1756 separate column, local MPC in tie; native and WASM 2D/3D plain and certificate APIs | Refused: compression `1.000e-9 kN`, resolvable beyond `4.441e-8 kN` | Returns the independent column factor within `1e-6` relative error |
| Constraints on free DOFs wholly inside another structure; equalDOF, rigidLink, linearMPC, eccentricConnection and diaphragm | Refused by the unrelated force scale | Returns the same independent column factor |
| Constraint connecting the column to the loaded tie; compression below / above the coupled bound | Refuses / answers | Refuses / answers at the unchanged limit |
| Exact #959 transverse-load witness | Refused | Refused |
| Exact #741 witness, also used by the #818 research regression | Refused | Refused |

The extremely slender exact #1756 model has an `Uncertified` enclosure status even in its unconstrained control: the existing interval check cannot prove the shifted stiffness positive definite. The fixed certificate API returns the analytical factor with that explicit status. Native and WASM regressions require the constrained model to match its unconstrained control in certificate status and factor, at the existing factor tolerance. A separate well-conditioned control requires a certified enclosure containing the independent root. No certificate criterion is weakened.

Previously returned results can also gain a member's geometric stiffness, mode or element buckling data when that independent member was wrongly omitted by the global constraint scale. Unresolved-mode diagnostics can consequently change. The omitted-member check still refuses if uncertain compression can materially lower the critical factor. No new numerical baseline is accepted merely because the implementation returns it.

## Boundary and refusal evidence

The own-component boundary test prescribes a unit axial translation at the column base and uses axial loads `2000 · 2⁻⁴⁵` and `2000 · 2⁻⁴⁴ kN`. The column's `EA/L` is `2000 kN/m`, so its exact shortenings are powers of two, avoiding an inaccurate analytical-factor comparison caused by subtraction of nearly equal endpoint displacements. These loads bracket `100 ε · (EA/L) · (|ui| + |uj|)`, and the test requires refusal below and the analytical factor above, at the original `1e-4` tolerance. No production threshold was changed.

The genuinely connected equalDOF and diaphragm cases use the original `4e-8` / `5e-8 kN` boundary loads. They continue to refuse below the component noise and return the analytical factor above it. The #741 and #959 exact-model refusal regressions are ported from `cause_c_replay`; the original #818 accuracy test stays ignored because its only compression remains unresolved. This change supplies no new independently validated #818 factor.

## Targeted verification

Reproducer commit A is `2216bf191`. Its ignored #1756 tests are exercised explicitly against its production sources, then exercised with the fix and ignores removed. The handoff records exact commands, failures, controls, certificate limitations and final results. Native coverage includes plain and certificate APIs in 2D/3D, every constraint kind, a sparse constrained solve, warping, own-bound and connected-bound boundaries, omitted-member effects and nonlinear controls. WASM tests exercise the real exports and the web containment wrapper alongside exact #741/#959 refusals.

The scope is a conservative false refusal on main. No silently wrong main or release result is established here, and no advisory is added.
