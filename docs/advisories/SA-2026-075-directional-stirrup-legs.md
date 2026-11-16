# SA-2026-075: Incorrect directional stirrup legs and primary shear depth

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-16; fixed in PR #2198, pending merge and release |
| Issue | [#2171](https://github.com/lambdaclass/stabileo/issues/2171) |
| Fix | PR #2198; pending merge and release |
| Fixed release | Not released |
| Affected versions | Directional legs confirmed on origin/main `9d925a780`; primary shear depth on origin/main `db3ebf092`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`directional-stirrup-legs`](../../web/src/lib/provenance/result-changes/directional-stirrup-legs.json) |

## Affected features

CIRSOC 201-2005 and 2025 concrete member checks with secondary shear, combined
shear and torsion, insufficient leg distribution or omitted secondary-shear checks,
regardless of the relationship between primary and secondary leg counts. This
includes designed members and provided reinforcement, including cages with
two primary and two secondary legs.
Provided beam and wall reinforcement is also affected when the actual stirrup
diameter differs from the nominal section diameter, including cages selected
by the beam generator. Using nominal depth for a larger actual cage can
overstate primary shear capacity and change a prior pass to failure even with
adequate leg distribution and no
secondary shear or torsion. Support, explicit end and span cages are included.
The saved-project notice selects concrete members in 2D, 3D and Pro. Planar
models have no secondary shear or torsion degrees of freedom. Primary leg
distribution and actual-cage primary shear depth still apply in 2D; spatial
models also expose the secondary direction. Both editions use the native section
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

The inherited primary shear depth defect is documented in the
[round-10 results record](../results-changes/2198-round10-primary-depth.md) and
[changelog entry](../../changelog.d/2198-round10-primary-depth.md). Provided beam
and wall checks paired the actual cage reinforcement area with a primary
effective depth derived from the nominal stirrup diameter. A larger actual
diameter reduces effective depth, so the old calculation could overstate
capacity and accept primary shear above the actual capacity. A smaller actual
cage received the wrong depth in the opposite direction. This defect does not
require secondary shear, torsion or inadequate leg distribution. The record
confirms it on main source at `db3ebf092`; historical release binaries were not
assessed.

## How to tell if your model is affected

Review concrete cages with secondary shear or torsion and every cage whose leg
distribution may be insufficient, including two-leg cages with equal directional
counts. Check both shear directions even at zero torsion. Check how many legs
actually resist each direction, including any horizontal crossties, and verify
the spacing of those legs across each web independently of strength. A previous overall pass or successful solve does not
establish that the steel credited in each direction exists. The saved-project
notice conservatively selects concrete members; it does not prove every
selected member had an incorrect result.

Also review every provided beam and wall support, explicit end and span cage
whose actual stirrup diameter differs from the nominal section diameter,
including generated cages. Check primary effective depth, shear capacity,
steel ratio and spacing using each actual cage. Adequate leg distribution and
zero secondary shear and torsion do not rule out this exposure.

## Fixed in

Fixed in PR #2198, pending merge and release. Separate immutable directional
leg counts feed a shared shear provision path. Old rectangular cages default
to two secondary legs. Combined shear and torsion checks each face separately;
torsion remains limited by one leg of the outer closed hoop. Shared spacing
no longer copies one direction's legs to the other. The required distributed
leg count is checked independently of strength in each direction, retaining
the supplied reinforcement and failing when it is insufficient.
Both directional effective depths now come from one shared cage-bound geometry
resolver. Each provided beam and wall support, explicit end and span check uses
its actual cage diameter consistently for primary shear capacity, steel ratio
and spacing.

The separate secondary-width minimum and edition-specific torsion minimum
questions remain outside this correction. This fix does not add native
torsion verification or certify fabrication of manually declared crossties.
Existing engineering limits, tolerances and strength assertions are unchanged.

## Workaround

Until the correction is merged and released, independently verify primary and
secondary shear and combined shear–torsion reinforcement using the legs actually
present in each direction. For provided beam and wall support, explicit end and
span cages, derive primary effective depth from each actual stirrup diameter
and longitudinal bar arrangement, including final bar shifts, and use that
same depth for capacity, steel ratio and spacing. Do this even with adequate
leg distribution and zero secondary shear and torsion. Do not credit additional
primary legs as horizontal crossties. Check transverse leg spacing independently of total steel area.

## What to do with results you already have

After upgrading to a release containing the correction, rerun saved concrete
member design and provided-reinforcement checks. Review primary and secondary
shear, torsion, governing checks, actual cage diameters, effective depths, steel
ratios, stirrup counts and spacing, calculations and
deliverables based on the old results. Declare horizontal crossties only when
the physical reinforcement provides them. Adding primary legs alone does not
correct an inadequate secondary cage. Recheck beam and wall cages against
primary shear even if their leg distribution is adequate and they have no
secondary shear or torsion; a larger actual diameter can turn a prior primary
shear pass into failure.

## Credits and references

The exposure is tracked as #2171. The coordinator assigned SA-2026-075.
The [results-change record](../results-changes/2026-11-directional-stirrup-legs.md)
retains both editions, the silent main witness, shared-path coverage,
boundary tests and correct controls. The fix is in
[PR #2198](https://github.com/lambdaclass/stabileo/pull/2198), pending merge and release.
