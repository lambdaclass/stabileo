# SA-2026-123: Automatic gravity could misapply loads near headroom and cover limits

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-25 |
| Issue | [#2564](https://github.com/lambdaclass/stabileo/issues/2564) |
| Fix | PR [#2576](https://github.com/lambdaclass/stabileo/pull/2576), merged as `6fadfd3a3` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Roof and floor cover selection dates to the first numbered release, 0.2.0 (`491d43d1d`). The affected retained-bay and strip headroom handling dates to 0.5.0 (`ce80d54af`), with later changes to clearance sampling in 0.6.2 (`7763f3a25`). The affected cases were replayed with the 0.6.4 planner and pre-fix main. |
| Re-check registry | [`gravity-physical-thresholds`](../../web/src/lib/provenance/result-changes/gravity-physical-thresholds.json), [`gravity-strict-headroom`](../../web/src/lib/provenance/result-changes/gravity-strict-headroom.json), [`gravity-retained-bay-headroom`](../../web/src/lib/provenance/result-changes/gravity-retained-bay-headroom.json), [`gravity-resolved-cover`](../../web/src/lib/provenance/result-changes/gravity-resolved-cover.json) |

## Affected features

PRO 3D Auto Loads for gravity loads on framing bays and standalone
member strips near the headroom limit, and for roof and floor selection
below beam bays with noncoplanar corners. Member exposure also feeds roof
weight estimates and the roof member selection used for wind and snow.

## What was wrong

The planner could use rounded storey elevations to compare the height of
physical deck surfaces. It could also skip the overlap check when sampled
points missed a low-clearance region. The resulting plan could retain
gravity load on a lower bay or strip where the upper framing already
carried it.

- In one stacked-bay regression, rounded elevations hid clearance
  below the 2.2 m headroom limit and the lower bay retained all 36 m².
  The corrected plan omits the lower bay. The upper bay retains 36 m².
- In the inclined-strip regressions, the planner retained all 6 m².
  The corrected plans keep 3 m² and 5.25 m², respectively.
- With a low-clearance triangle beyond the probes at one corner of a
  lower bay, the planner retained 36 m². The corrected plan keeps
  approximately 35.71875 m². At the fixture pressure of 1 kN/m² the lower
  dead-load resultant changed from 36 kN to approximately 35.71875 kN.
- The planner could return a ready plan when a noncoplanar beam bay's
  height range straddled the 0.05 m cover threshold, or when clearance to an
  overhead shell was indeterminate at the strict headroom limit. These
  models require a defined deck surface or an explicit load assignment
  where the ambiguity affects loading.

[Results-change records for physical thresholds](../results-changes/2026-11-gravity-physical-thresholds.md),
[strip clipping](../results-changes/2026-11-gravity-strict-headroom.md),
[bay clipping](../results-changes/2026-11-gravity-retained-bay-headroom.md)
and [resolved cover](../results-changes/2026-11-gravity-resolved-cover.md).

## How to tell if your model is affected

Review Auto Loads plans with stacked framing, inclined lower bays or
strips, or noncoplanar beam rings over other load carriers. Compare the
physical clearance at the overlap with the planner's headroom and cover
limits. Verify the loaded area, the extents of member loads and which
carriers received floor or roof actions. Check the roof weight and the
member selection in any dependent roof wind or snow plan.

## Fixed in

The next release after 0.6.4. PR
[#2576](https://github.com/lambdaclass/stabileo/pull/2576) compares the
physical surfaces over the actual overlap and clips retained areas even
where the probes miss an obstruction. It blocks generation when the
headroom or cover needed for an assignment remains indeterminate.

## Workaround

Assign independently verified loads to explicit members and shells for
the affected regions. Use a defined deck surface wherever the beam
geometry alone leaves its height indeterminate.

## What to do with results you already have

Regenerate affected automatic gravity and dependent roof wind and snow
loads. Verify the assigned loads, areas and extents before solving.
Update dependent mass sources and rerun affected analyses and
combinations. Rebuild envelopes, repeat dependent design checks, and
regenerate reports.

## Credits and references

See [issue #2564](https://github.com/lambdaclass/stabileo/issues/2564),
[PR #2576](https://github.com/lambdaclass/stabileo/pull/2576) and the
[gravity threshold regressions](https://github.com/lambdaclass/stabileo/blob/6fadfd3a3/web/src/lib/engine/loads/__tests__/plan-gravity-thresholds-2564.test.ts).
