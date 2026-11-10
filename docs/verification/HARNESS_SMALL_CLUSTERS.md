# Remaining small harness clusters: replay and numerical integrity

Base: `cfd541d174f730024a1d16a335b8d48f9fdb953b` (also `origin/main` at replay).
The selected groups are effective-mass symmetry (#1213, #1219, #1267, #1365)
and shell-stress units (#1114, #1356). The issue-body JSON, original case names,
densities and published seeds are retained. Neither refusal nor inconclusive
means that a numerical result passed verification.

## Published models

| Issue | Seed | Published comparison on main | After this change |
|---|---|---|---|
| #1213 | 2026110200568 | modal symmetry: inconclusive | unchanged |
| #1219 | 2026110204090 | certified modal symmetry: inconclusive | unchanged |
| #1267 | 2026110303012 | certified modal symmetry: inconclusive | unchanged |
| #1365 | 2026110403879 | modal symmetry: inconclusive | unchanged |
| #1114 | 20759 | PCG units: input refused | unchanged |
| #1356 | 20761 | PCG units: input refused | unchanged |

The tests assert all seven verdict counts for each published comparison:
passes, identical refusals, refused originals, unrepresentable transforms,
not applicable, inconclusive, and failures. The mass cells each retain one
inconclusive verdict and one not-applicable verdict; the shell cells each
retain one original refusal. No count is converted into a numerical pass.

The shell models are identical apart from their issue/seed provenance. Support
6 has both `ky` and `ry`. Main refuses this contradictory boundary condition;
see [SA-2026-049](../advisories/SA-2026-049-support-spring-conflicts.md).
Removing only `ky` creates a **different model**, useful as a control, not a
replay of either published issue. On this control the `(0.3048, 4.448)` unit
map passes the ordinary comparison. Testing all three existing unit maps also
finds rotation and recovered-stress mismatches. Those are preserved as separate
ignored reproducers and are not declared harmless.

## What the bounds mean

For a mass-normalized mode, the directional effective-mass tensor is `g gᵀ`,
where `g_a = φᵀ M r_a / sqrt(φᵀ M φ)`. Its cumulative value depends on a modal
subspace, not on the arbitrary signs or basis of repeated modes. If `P` is its
projector in mass-whitened coordinates, an entry is `v_aᵀ P v_b`, with
`v_a = M^(1/2) r_a`. Thus its perturbation is bounded by
`||v_a|| ||v_b|| ||δP||`. The first two factors are the square root of the
product of the directional rigid-body masses. Subspace rotation depends on
the separation from the next eigenvalue; a perturbation of the whitened pencil
enters through `||δA|| / gap` when that separation is certified.

The existing comparator uses a total-mass floor and the gap factor
`1 + λ_k / (λ_(k+1) - λ_k)`. Its eigen accuracy estimate includes the full
spectral spread. On these four published cases that budget or the amplified
mass budget exceeds the existing reliability limit. This work does not replace
that estimate with a smaller one, certify an unmeasured gap, or declare the
computed tensors correct. A residual-based subspace certificate remains work
to do if a numerical verdict is required.

Shell stress recovery is a different operator from the stiffness solve.
For fixed geometry and material, write its linear components as `σ = H u + c`,
where `c` contains the imposed thermal strain. For the free solve, displacement
error obeys `K_ff e = r`; its contribution to recovered-stress error is
`H_f K_ff⁻¹ r`. Errors in assembly, geometry, recovery and prescribed values
must also be bounded. The plane-stress von Mises value is the norm induced by
`σ_x² - σ_x σ_y + σ_y² + 3 τ_xy²`, so the triangle inequality transfers a
component-error bound into a von Mises error bound. A stiffness condition number
alone is not that recovery bound. No empirical multiplier or tolerance
allowance is introduced here. The admitted-control mismatches remain
unresolved until such a bound or an engine defect is established.

## Fixed harness defect

Planted NaN and either infinity in an effective-mass tensor or shell stress
were classified as inconclusive before the comparator examined the values.
Mass tensors could also be dropped when their gap-amplified allowance exceeded
the reliability limit. Non-finite values are invalid independently of the
estimated round-off: no finite error interval contains them.

`judge_split` now checks every actual and expected response value before either
inconclusive path or the removal of widened tags. It reports the offending
side, tag, component, node and element. Finite comparisons use exactly the
previous comparator, bounds and reliability limit. Ordinary mass/stress
ratios are asserted identical; finite planted errors at twice the existing
allowance still fail. The new non-finite controls fail before the change and
pass after it, including both sides of the comparison and both inconclusive
paths.

No engine source or user result changes. No new results-change registry entry
or safety advisory is warranted by this harness-only validation change.
The historical contradictory-support behavior already has the advisory linked
above. No original issue is claimed fixed by the non-finite controls.

## Separate unresolved findings

- #971: its published P-Delta model solves in the original units and refuses
  the transformed units with `did not converge`. This is an engine convergence
  finding, not a comparison-tolerance failure.
- #1085: the published two-stage model still fails linear agreement, rotation
  and mirror comparisons. A staged-solve error model has not been established;
  the discrepancy is retained as a numerical candidate, not certified as
  round-off or as a proved wrong physical result.
- #1114 admitted controls: the tests retaining all three unit maps still expose
  rotation and recovered-stress mismatches. They are not the published input,
  and their numerical classification remains open.

All are durable ignored reproducers with `known wrong result` issue markers.
Their assertions remain intact. They must not be included in a claim that all
findings in these clusters are numerically resolved.
