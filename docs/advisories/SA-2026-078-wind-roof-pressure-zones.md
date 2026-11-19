# SA-2026-078: Roof pressure zones depended on member subdivision

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-16 |
| Issue | [#2205](https://github.com/lambdaclass/stabileo/issues/2205) |
| Fix | PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `9d925a780`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`wind-physical-pressure-field`](../../web/src/lib/provenance/result-changes/wind-physical-pressure-field.json) |

## Affected features

Generated CIRSOC 102-2025 building and free-roof pressure fields, including
members that cross physical pressure zones, perimeter carriers, slopes and
simultaneous wind directions. The shared TypeScript generator precedes solver
selection; saved-project notices apply in 2D, 3D and Pro.

## What was wrong

Roof loads used a representative point or mesh-dependent tributary assignment
rather than integrating each member's intersection with physical pressure
zones. The total load or its position could be wrong silently, and inserting
nodes changed the generated field.

On origin/main `9d925a780`, the #2205 witness with two 12 m roof carriers has
10.2 kN uplift, but its first moment along X is 61.2 instead of 45.9 kN·m.
A 10 × 6 m roof perimeter has 14.62 instead of 15.3 kN uplift. The independent
zone integrals and checked-in coefficient sources are in the
[results-change record](../results-changes/2026-11-wind-physical-pressure-field.md).
These are witnesses, not an error bound; retaining the correct total force
does not establish a correct pressure distribution.

This is a main-source replay, not a historical release-binary replay. Earlier
introduction and historical release exposure have not been assessed.

## How to tell if your model is affected

Review generated roof pressure on members crossing zones, unevenly subdivided
roofs, roof perimeters and free roofs. Check each physical carrier's force and
first moment, including roof-normal components for slopes. An earlier
successful solve does not establish subdivision invariance.

## Fixed in

0.6.2 (PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220)).

One shared pressure integrator splits carriers at physical zone boundaries,
integrates force and first moment and preserves partial member intervals and
global roof-normal components. Roof geometry identifies physical facets and
carrier shares. Simultaneous directions compare pressures on each intersected
interval. Existing coefficient tables, inequalities and tolerances remain
unchanged.

## Workaround

Independently integrate the prescribed roof zones, including the first moment,
and check the load allocation before using affected generated results.

## What to do with results you already have

After upgrading to 0.6.2, review every wall and
roof opening record, reclassify the enclosure, regenerate W and Wa loads, then
rerun analyses, combinations and design checks. Re-solving stored generated
loads alone does not correct them. Review load distributions, governing cases,
member sizing, calculations and deliverables based on the old loads.

## Credits and references

The exposure is tracked as #2205. The coordinator assigned SA-2026-078.
The [results-change record](../results-changes/2026-11-wind-physical-pressure-field.md)
retains main witnesses, shared-path coverage, boundary tests and correct
controls. The fix shipped in 0.6.2 (PR [#2220](https://github.com/lambdaclass/stabileo/pull/2220)).
