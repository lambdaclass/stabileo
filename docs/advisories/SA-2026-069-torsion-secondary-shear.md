# SA-2026-069: Concrete torsion section limits omitted concurrent secondary shear

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-15; fixed in PR #2169, pending merge and release |
| Issue | [#2142](https://github.com/lambdaclass/stabileo/issues/2142) |
| Fix | PR [#2169](https://github.com/lambdaclass/stabileo/pull/2169); pending merge and release |
| Fixed release | Pending |
| Affected versions | Confirmed on main `44966b6e75f72ce268ec87798d5cd880a6dba144`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`torsion-secondary-shear`](../../web/src/lib/provenance/result-changes/torsion-secondary-shear.json) |

## Affected features

CIRSOC 201 solid rectangular concrete member design and verification with
concurrent secondary shear and torsion, in both supported editions. Beams,
columns and walls reach the shared TypeScript section check. Spatial linear
and P-Delta results reach this path; planar solver results have no torsion
degree of freedom. Native RC checks do not implement torsion and already
state that it is not rechecked.

## What was wrong

The verifier retained the complete concurrent demand but passed only primary
shear and torque to the concrete shear–torsion section check. A separate
secondary-shear reinforcement check did not establish that the section itself
could carry secondary shear and torsion together. The provided-beam sweep
also skipped torsion with zero primary shear or absent stirrups.

The retained column witness has b = 0.30 m, h = 0.60 m, cover = 0.025 m,
fc = 25 MPa, fy = 420 MPa and 8 mm stirrups, with Mu = 20 kN·m, Nu = 0,
primary shear = 0, secondary shear = 100 kN and torque = 57 kN·m. With
explicitly sufficient fixed steel (four stirrup legs at 0.05 m and additional
longitudinal torsion allocation 100 cm²), main reports both torsion and overall
status as `ok`: allowable torque 58.055253822359695 kN·m and utilization
0.9818232846662145. The corrected result is `fail`: allowable torque
56.80093509783761 kN·m and utilization 1.0035046060741695. The independent
clause calculation gives combined-stress utilization 1.0033550542199214.
The designer reports torque utilization, which differs from combined-stress
utilization away from unity. These values come from the committed
[results-change record](../results-changes/2026-11-torsion-secondary-shear.md)
and [numerical comparison](../results-changes/2142-torsion-secondary-shear-diff.json).
They are a witness, not an error bound for other members.

This is main-source replay evidence, not a historical release binary replay.
No claim is made that an older release binary ran this exact model.

## How to tell if your model is affected

Review solid rectangular concrete members carrying torque with secondary
shear, including members that passed separate shear reinforcement checks.
Review provided-beam torsion checks where primary shear is zero or stirrups
are missing. A previous torsion `ok` status or an absent torsion row does not
establish section or reinforcement adequacy. The saved-project notice
conservatively selects concrete members.

## Fixed in

PR #2169 is pending merge and release. The shared torsion module requires the
complete concurrent section demand and both effective depths. Every caller
checks both section orientations with their concurrent torque. The
provided-beam sweep reaches this same checker independently of primary shear
and stirrup provision; non-negligible torsion without stirrups explicitly fails.
The neglect rule and numerical tolerances are unchanged.

The concrete section limit is independent of reinforcement provision. Adding
stirrups cannot repair an exceeded section limit. This fix does not certify
longitudinal bar placement, add hollow or prestressed torsion design, or change
native torsion capability disclosures.

## Workaround

Until the fix is merged and released, independently check the concrete
shear–torsion section limit in both orientations using concurrent demands.
Check the actual transverse cage and longitudinal torsion reinforcement.
Do not accept a member solely because its earlier torsion status passed or
because the provided-beam report omitted a torsion row.

## What to do with results you already have

Re-run saved concrete member designs after upgrading to a version containing
PR #2169. Review torsion section failures, actual stirrup provision and
longitudinal reinforcement. Revisit member sizing, calculations and
deliverables based on a previous passing result; additional stirrups cannot
repair a concrete section that exceeds its limit.

## Credits and references

The omission is tracked as #2142. The coordinator assigned SA-2026-069.
The [results-change record](../results-changes/2026-11-torsion-secondary-shear.md)
retains the exact witness, independent clause calculation, entry-point coverage,
boundary tests and unchanged controls. The
[provided-stirrup advisory](SA-2026-068-provided-torsion-stirrups.md) covers the
separate acceptance of inadequate designed stirrups.
