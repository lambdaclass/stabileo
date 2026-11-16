# SA-2026-075: Primary stirrup legs were credited to secondary shear

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-16; fixed in PR #2198, pending merge and release |
| Issue | [#2171](https://github.com/lambdaclass/stabileo/issues/2171) |
| Fix | PR #2198; pending merge and release |
| Fixed release | Not released |
| Affected versions | Confirmed on origin/main `9d925a780`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`directional-stirrup-legs`](../../web/src/lib/provenance/result-changes/directional-stirrup-legs.json) |

## Affected features

CIRSOC 201-2005 and 2025 concrete member checks with secondary shear, combined
shear and torsion, insufficient leg distribution or omitted secondary-shear checks,
regardless of the relationship between primary and secondary leg counts. This
includes designed members and provided reinforcement, including cages with
two primary and two secondary legs.
The saved-project notice selects concrete members in 2D, 3D and Pro. Planar
models have no secondary shear or torsion degrees of freedom. Primary leg
distribution still applies in 2D; spatial models also expose the secondary
direction. Both editions use the native section
evaluator through WASM; the direction selection occurs in the web layer.

## What was wrong

The member verifier passed one primary leg count to both shear directions and
reconciled the cage by taking their maximum count. Provided-column and shared
torsion checks repeated that assumption. Extra primary legs were credited as
horizontal crossties that had never been declared. Secondary shear capacity
could be overstated and an inadequate cage could pass overall without warning.

The retained silent-pass witness is a column with b=0.20 m, h=0.40 m,
fc=25 MPa, fy=420 MPa, cover=0.025 m, 8 mm stirrups, four primary legs at
0.10 m and no declared horizontal crossties. It has primary moment 20 kN·m,
zero axial force, zero primary shear and zero torque. In 2025, secondary shear
95.4770355 kN gives main capacity 141.31601999999998 kN and utilization
0.6756278269087964, overall `ok`. The actual two horizontal legs give capacity
90.93051 kN and utilization 1.05, overall `fail`. Flexure, primary shear and
column checks pass on main. Zero torque rules out a torsion warning masking
this silent result. The same witness in 2005 uses secondary shear
94.6422855 kN: main capacity 140.52102 kN versus correct capacity 90.13551 kN,
also changing overall `ok` to `fail`.

These values come only from the [results-change record](../results-changes/2026-11-directional-stirrup-legs.md)
and its [numerical evidence](../results-changes/2171-directional-stirrup-legs-diff.json).
The [leg-spacing evidence](../results-changes/2171-leg-spacing-diff.json) also records
a two-primary/two-secondary-leg beam that passes on main and fails the corrected
primary distribution check. Extra primary legs are not a condition of exposure.
These are witnesses, not error bounds for other members. This is a main-source
replay, not a historical release-binary replay. Earlier introduction and
historical release exposure have not been assessed.

## How to tell if your model is affected

Review concrete cages with secondary shear or torsion and every cage whose leg
distribution may be insufficient, including two-leg cages with equal directional
counts. Check both shear directions even at zero torsion. Check how many legs
actually resist each direction, including any horizontal crossties, and verify
the spacing of those legs across each web independently of strength. A previous overall pass or successful solve does not
establish that the steel credited in each direction exists. The saved-project
notice conservatively selects concrete members; it does not prove every
selected member had an incorrect result.

## Fixed in

Fixed in PR #2198, pending merge and release. Separate immutable directional
leg counts feed a shared shear provision path. Old rectangular cages default
to two secondary legs. Combined shear and torsion checks each face separately;
torsion remains limited by one leg of the outer closed hoop. Shared spacing
no longer copies one direction's legs to the other. The required distributed
leg count is checked independently of strength in each direction, retaining
the supplied reinforcement and failing when it is insufficient.

The separate secondary-width minimum and edition-specific torsion minimum
questions remain outside this correction. This fix does not add native
torsion verification or certify fabrication of manually declared crossties.
Existing engineering limits, tolerances and strength assertions are unchanged.

## Workaround

Until the correction is merged and released, independently verify secondary
shear and combined shear–torsion reinforcement using the legs actually
present in each direction. Do not credit additional primary legs as horizontal
crossties. Check transverse leg spacing independently of total steel area.

## What to do with results you already have

After upgrading to a release containing the correction, rerun saved concrete
member design and provided-reinforcement checks. Review secondary shear,
torsion, governing checks, stirrup counts and spacing, calculations and
deliverables based on the old results. Declare horizontal crossties only when
the physical reinforcement provides them. Adding primary legs alone does not
correct an inadequate secondary cage.

## Credits and references

The exposure is tracked as #2171. The coordinator assigned SA-2026-075.
The [results-change record](../results-changes/2026-11-directional-stirrup-legs.md)
retains both editions, the silent main witness, shared-path coverage,
boundary tests and correct controls. The fix is in
[PR #2198](https://github.com/lambdaclass/stabileo/pull/2198), pending merge and release.
