# SA-2026-099: Generated gravity and roof-step snow loads could apply the wrong forces

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2347](https://github.com/lambdaclass/stabileo/issues/2347), [#2254](https://github.com/lambdaclass/stabileo/issues/2254), [#2218](https://github.com/lambdaclass/stabileo/issues/2218), [#2284](https://github.com/lambdaclass/stabileo/issues/2284), [#2299](https://github.com/lambdaclass/stabileo/issues/2299) |
| Fix | PR [#2406](https://github.com/lambdaclass/stabileo/pull/2406), merged as `2afa4b94d`; related shell overlap refusals in PR [#2339](https://github.com/lambdaclass/stabileo/pull/2339) |
| Fixed release | 0.6.3 (containment) |
| Affected versions | Confirmed in 0.6.2. Earliest affected release is unconfirmed |
| Re-check registry | [`gravity-offset-shell-seams`](../../web/src/lib/provenance/result-changes/gravity-offset-shell-seams.json), [`gravity-carrier-slope-limit`](../../web/src/lib/provenance/result-changes/gravity-carrier-slope-limit.json), [`snow-step-drift-transfer`](../../web/src/lib/provenance/result-changes/snow-step-drift-transfer.json), [`gravity-shell-ownership`](../../web/src/lib/provenance/result-changes/gravity-shell-ownership.json) |

## Affected features

Panel-mode gravity generation for overlapping shells or beam bays and
shell decks linked by rigid connections, gravity generation for members
near the carrier slope limit, and automatic snow generation for drift at
steps between roof panels.

## What was wrong

The generator could treat fully tied halves of one shell deck as separate
when the ties went through master nodes away from the seam. It could then
load both the shell and the beam bay beneath it. In the seam reproducer
the plan applied 132 kN of dead load to a deck that should receive 72 kN.
Overlapping shell footprints and simpler rigidly linked beam and shell
overlaps could also receive duplicate loads.

Near the carrier slope limit, rotation in plan or member subdivision
could change which bars received gravity loads. The geodesic dome
reproducer returned different total dead loads after a plan rotation
without any change to the physical structure or pressure.

Snow drift at a roof step could lose force and eccentric moment when the
drift pressure was converted into member loads. In the flat-step
reproducer the transfer applied about 2.95 kN against an expected 3.05 kN
from the drift triangle. The load generator could report the plan as ready
without identifying the transfer error.
[Results-change record](../results-changes/2026-11-gravity-carrier-refusals.md).

## How to tell if your model is affected

Review generated gravity cases for closely spaced shell decks and beam
bays, overlapping shells, or apparently coincident shell seams connected
through rigid links. Check gravity assignments on curved or inclined
framing near the carrier slope limit. Review generated snow cases at
steps between roof panels, including where the panels are pitched.

## Fixed in

0.6.3. PR [#2406](https://github.com/lambdaclass/stabileo/pull/2406) extends
the shell overlap refusal to seams tied through offset masters. Generation
also refuses when rounding can change whether a member carries gravity,
or when roof-step drift needs transfer to members or its applicability is
indeterminate. PR [#2339](https://github.com/lambdaclass/stabileo/pull/2339)
blocks other overlapping shell and beam load paths.

## Workaround

Regenerate the loads in 0.6.3. If generation refuses or an upgrade is
unavailable, define the relevant gravity or snow cases from independently
verified load paths, including the drift force and its line of action.

## What to do with results you already have

Replace the affected gravity and snow cases before rerunning analyses,
combinations and design checks. Check that the applied weight is carried
once and verify carrier assignments, drift resultants and governing
member forces. Review and regenerate affected reports.

## Credits and references

See [PR #2406](https://github.com/lambdaclass/stabileo/pull/2406), its
[load generation record](../results-changes/2026-11-gravity-carrier-refusals.md)
and the related [shell gravity record](../results-changes/2026-11-gravity-shell-ownership.md).
