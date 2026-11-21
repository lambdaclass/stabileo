# SA-2026-100: Reaction, free-body and point-load readouts could show the wrong signs or axes

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-21 |
| Issue | [#2370](https://github.com/lambdaclass/stabileo/issues/2370) |
| Fix | PR [#2396](https://github.com/lambdaclass/stabileo/pull/2396), merged as `283236d3e` |
| Fixed release | Next release (0.6.4) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | None. The issue affected presentation only |

## Affected features

The Basic spatial results table, the planar and spatial free-body
inspectors, and member point-load listings in Basic and PRO calculation
reports. The underlying solver reactions and member forces are unchanged.

## What was wrong

The Basic spatial table displayed support reaction moments with the
opposite sign. The spatial free-body inspector could label a member-local
moment as a global component. In the planar inspector, a signed label on
the node side of an end could repeat the member-side value even though
the arrow pointed in the opposite direction.

A calculation report could label the axial part of a planar member point
load as global `Px` even though it acted along the member. In a native
spatial model, a report could use the wrong plane to label a legacy
planar point force or couple. The readouts gave no notice that a sign or
axis was wrong.

## How to tell if your model is affected

Review spatial reaction moments from the Basic table and spatial
member-end values read in global axes. Check planar free-body labels
read at a node against the corresponding arrows. Review point-load
listings for loads with axial components on inclined or vertical
members and for legacy planar loads in spatial models.

## Fixed in

Next release (0.6.4). PR [#2396](https://github.com/lambdaclass/stabileo/pull/2396)
uses signed end actions in the selected basis and displays reaction
moments in their declared axes. The reports use the solver plane and the
member direction to label the applied components.

## Workaround

Verify signs and directions against the applied loads, member axes and
equilibrium before using the affected readouts or reports.

## What to do with results you already have

Reinspect the affected reactions and member ends, review calculations
that used the readouts, and regenerate affected reports with 0.6.4.

## Credits and references

See [PR #2396](https://github.com/lambdaclass/stabileo/pull/2396) for the
display and report reproducers and
[SA-2026-094](SA-2026-094-plane-free-body-end-moments.md) for the earlier
planar member-end moment correction.
