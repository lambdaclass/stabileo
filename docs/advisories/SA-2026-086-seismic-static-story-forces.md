# SA-2026-086: Generated static seismic loads could misstate story and member actions

| | |
|---|---|
| Severity | High |
| Status | Drafted 2026-11-19 |
| Issue | [#2208](https://github.com/lambdaclass/stabileo/issues/2208), [#2328](https://github.com/lambdaclass/stabileo/issues/2328) |
| Fix | PR [#2316](https://github.com/lambdaclass/stabileo/pull/2316), merged as `23fc68ff7` |
| Fixed release | Pending release |
| Affected versions | Confirmed on origin/main `5319f72147479ca62f0a8178ccdb102fd1f53750`. Historical releases and introduction unassessed |
| Re-check registry | [`seismic-member-mass`](../../web/src/lib/provenance/result-changes/seismic-member-mass.json), [`seismic-support-datum`](../../web/src/lib/provenance/result-changes/seismic-support-datum.json), [`seismic-zero-weight-geometry`](../../web/src/lib/provenance/result-changes/seismic-zero-weight-geometry.json), [`seismic-connected-datum`](../../web/src/lib/provenance/result-changes/seismic-connected-datum.json), [`seismic-connectivity`](../../web/src/lib/provenance/result-changes/seismic-connectivity.json), [`seismic-shell-geometry`](../../web/src/lib/provenance/result-changes/seismic-shell-geometry.json), [`seismic-diaphragm-stories`](../../web/src/lib/provenance/result-changes/seismic-diaphragm-stories.json), [`seismic-base-inertia-plan-width`](../../web/src/lib/provenance/result-changes/seismic-base-inertia-plan-width.json), [`seismic-story-overturning`](../../web/src/lib/provenance/result-changes/seismic-story-overturning.json), [`seismic-story-level-forces`](../../web/src/lib/provenance/result-changes/seismic-story-level-forces.json), [`seismic-story-member-inertia`](../../web/src/lib/provenance/result-changes/seismic-story-member-inertia.json) |

## Affected features

Automatic static (equivalent lateral force) seismic load generation and analyses,
combinations and designs using its generated loads. The load planner places these
actions before solver selection. Node subdivision could also change the modal story forces and reported mass
participation. [Issue #2209](https://github.com/lambdaclass/stabileo/issues/2209),
[SA-2026-087](SA-2026-087-seismic-modal-load-generation.md).

## What was wrong

The generator divided each story force equally among its nodes. Subdivision
changed the forces assigned to the nodes and could shift the resultant away
from the physical mass centroid. In #2208, adding one node on a rectangular
floor edge changed the vertical-axis moment from −300 to −260 kN·m for the
same 100 kN story force. Putting roof inertia at beam ends also omitted
span bending and deflection in the restrained-roof witness. [Issue #2208](https://github.com/lambdaclass/stabileo/issues/2208)
and the [member inertia record](../results-changes/2026-11-seismic-story-member-inertia.md)
document the load placement and member response.

The static planner used global `z = 0` as the seismic base. In #2328,
moving the same supported cantilever up 10 m doubled seismic weight (W) and
base shear (V) from 4 to 8 kN without a diagnostic. Moving its support to
−5 m generated no seismic action and showed a nonblocking no-mass notice.
Disconnected geometry could receive seismic forces or inflate the plan width.
Stepped supports could pass without a diagnostic, and participating mass below
the supports could be silently omitted. Invalid shell corners could also
cause shell mass to be dropped from a plan that was reported ready.
[Issue #2328](https://github.com/lambdaclass/stabileo/issues/2328),
[connectivity record](../results-changes/2026-11-seismic-connectivity.md),
[shell geometry record](../results-changes/2026-11-seismic-shell-geometry.md).

A zero-weight story could be left out of the height and story count used
for the approximate period and static-method limits. This could change base
shear or allow static generation where the method's limits required refusal.
The plan footprint could omit the physical offset of massless edge framing and
understate accidental torsion. A 45° case could also be generated with zero
accidental eccentricity when medium or extreme torsional irregularity was
selected. [Zero-weight geometry record](../results-changes/2026-11-seismic-zero-weight-geometry.md),
[member inertia record](../results-changes/2026-11-seismic-story-member-inertia.md).

## How to tell if your model is affected

Review models with previously generated static seismic cases, especially those
with subdivided framing, diaphragms, supports away from global elevation zero,
stepped supports, disconnected parts, mass below the support elevation,
zero-weight roofs, or offset perimeter framing. Check which geometry contributes
to the story elevations, participating weight and plan width. Verify the story
force locations, overturning, accidental torsion and member loading. Matching
base shear alone can miss errors in where inertia acts.

## Fixed in

PR [#2316](https://github.com/lambdaclass/stabileo/pull/2316), merged as
`23fc68ff7`. The static planner uses the common elevation of supports connected
to the seismic structure. It excludes unrelated supports from the datum and
counts structural stories, including diaphragm levels and zero-weight
stories, for the period and applicability checks.
Forces follow the tributary physical mass. Inertia at a story elevation acts
as distributed member loads and in-plane shell or plate loads. Off-level
mass transfers to its receiving story nodes with the plan moment accounted for.
The story action acts at its code-defined elevation and preserves the required
overturning moment. [Story force record](../results-changes/2026-11-seismic-story-level-forces.md),
[overturning record](../results-changes/2026-11-seismic-story-overturning.md).

Generation refuses a missing or stepped support datum, disconnected geometry
contributing mass or plan width, participating mass below the support datum,
invalid shell corners, and cases outside the static method's limits. It also
refuses unsupported mass geometry or load transfer, including offset members
used for the footprint, carriers without a required story attachment, and
accidental torsion the available carriers cannot represent. A 45° case with
medium or extreme torsional irregularity blocks the requested plan. Connected
massless framing can contribute to the plan width used for accidental eccentricity.

[SA-2026-096](SA-2026-096-static-seismic-stories-and-rafters.md) covers
the additional static seismic fixes in 0.6.3 for connected X-brace
intersections, subdivisions of inclined members, and rafter inertia.

Rounding can still assign a very thin mass band to the base and drop
its roof force. Very large opposing torsion forces on nearly coincident
carriers can also round away the translational force and produce the
wrong base shear. [#2334](https://github.com/lambdaclass/stabileo/issues/2334)

## Workaround

Independently establish the applicable seismic method, story weights and
heights, base shear, overturning and accidental torsion. Where generation is
refused or one of the still-open conditions above applies, use independently
verified explicit load cases before relying on the member results.

## What to do with results you already have

After upgrading to a build containing #2316, regenerate affected static
seismic loads, then rerun analyses, load combinations and designs. Replace
the earlier generated cases and review member forces, deflections, sizing and
deliverables that relied on them. Re-solving the saved loads repeats the old
load placement.

## Credits and references

See [PR #2316](https://github.com/lambdaclass/stabileo/pull/2316) and the
[physical mass results-change record](../results-changes/2026-11-seismic-member-mass.md)
for the correction and regression evidence.
