# SA-2026-120: Automatic gravity could duplicate or misplace deck loads

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2543](https://github.com/lambdaclass/stabileo/issues/2543) |
| Fix | PR [#2563](https://github.com/lambdaclass/stabileo/pull/2563), merged as `108ae8a2d` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Independent shell loading and roof exposure date to `491d43d1d` (first numbered release 0.2.0). The affected headroom and fringe handling took shape in the 0.5.0 and 0.6.2 planner changes, including `fc9421f25` and `d0661891b`. Selected-roof snow shares the roof selection used by `e011193a1` (0.2.0), with later snow geometry changes in `6d8fd2350` (0.6.1). Released 0.6.4 returned affected plans. Main subsequently refused some of the overlapping-shell and shell-filled opening cases before this fix |
| Re-check registry | [`gravity-exact-ownership`](../../web/src/lib/provenance/result-changes/gravity-exact-ownership.json), [`gravity-local-deck-coverage`](../../web/src/lib/provenance/result-changes/gravity-local-deck-coverage.json), [`gravity-retained-span-midpoint`](../../web/src/lib/provenance/result-changes/gravity-retained-span-midpoint.json) |

## Affected features

PRO Automatic Loads for spatial models with overlapping shells or shell
and beam decks, lower bays or strips under framing or pitched shells,
inclined framing that receives retained fringe loads, or partly covered roofs and
floors. Exposure also affects roof-weight estimates, member geometry used
for wind, and snow loads generated for selected roof members.

## What was wrong

Overlapping shells or a bay and a vertically tied shell could each receive
the same floor pressure. Headroom clipping could put part of a shell-filled
opening back into beam loads, miss an obstruction where clearance varied
across the bay, or send load to a retained bay that was too wide for
automatic transfer. On 0.6.4 the shell-filled opening regressions returned
READY with lower-level loads of 10 kN and 54 kN where the independent
checks expect 9 kN and 52 kN. In the local-clearance regression, a bay
retained 60 m² where 36 m² should have remained.

Fringe loads on inclined members could use projected stations and
intensities directly, misplacing the resultant. A deck or member could also
receive the wrong roof or floor action when cover was inferred from a
centroid, a rounded level, or a member endpoint elevation. A bay under
partial cover could receive one action across its entire area. The
selected-roof snow regression returned a READY plan with snow on a
covered member. The low-framing regression returned a READY plan whose
wide-panel note described a skipped nested ring while the oversized
retained footprint still received load.

[Results-change records for ownership and transfer](../results-changes/2026-11-gravity-exact-ownership.md),
[local cover](../results-changes/2026-11-gravity-local-deck-coverage.md)
and [retained spans and member midpoints](../results-changes/2026-11-gravity-retained-span-midpoint.md).

## How to tell if your model is affected

Review saved automatic plans for overlapping shells, vertical ties and
eccentric connections, shell-filled openings, low framing, pitched
overhangs, and partially covered roofs or floors. Check the receiving
members and shells, applied pressures, distributed load extents, level
totals and selected-roof snow actions against the intended loaded area.
For inclined fringe members, check the location as well as the total of
the applied load.

## Fixed in

The next release after 0.6.4. PR
[#2563](https://github.com/lambdaclass/stabileo/pull/2563) uses the owned
footprint and physical elevations to check clearance and cover, converts
fringe loads to physical member stations and intensities, and rechecks
the retained span before transfer. The planner refuses uncertain
ownership or mixed exposure when the requested actions require a
single assignment. Member exposure uses the physical midpoint.

## Workaround

Assign verified loads to explicit carriers where ownership, clearance or
exposure is uncertain. Check the load totals and locations before solving.

## What to do with results you already have

Regenerate affected automatic gravity, snow and wind plans. Resolve any
refusal by establishing the intended geometry or assigning verified loads
explicitly. Verify the resulting loads, update dependent mass sources,
then rerun affected analyses and combinations. Rebuild envelopes,
repeat dependent design checks, and regenerate affected reports.

## Credits and references

See [issue #2543](https://github.com/lambdaclass/stabileo/issues/2543),
[PR #2563](https://github.com/lambdaclass/stabileo/pull/2563), the
[ownership and transfer regressions](https://github.com/lambdaclass/stabileo/blob/108ae8a2d/web/src/lib/engine/loads/__tests__/gravity-ownership-2543.test.ts)
and the [headroom and exposure regressions](https://github.com/lambdaclass/stabileo/blob/108ae8a2d/web/src/lib/engine/loads/__tests__/gravity-overhead-review-2543.test.ts).
