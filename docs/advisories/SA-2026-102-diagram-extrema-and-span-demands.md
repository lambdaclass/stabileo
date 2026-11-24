# SA-2026-102: Member diagrams could miss governing forces and reversed beam pieces could swap design faces

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2273](https://github.com/lambdaclass/stabileo/issues/2273), [#2250](https://github.com/lambdaclass/stabileo/issues/2250), [#2252](https://github.com/lambdaclass/stabileo/issues/2252), [#2226](https://github.com/lambdaclass/stabileo/issues/2226), [#2238](https://github.com/lambdaclass/stabileo/issues/2238) |
| Fix | PR [#2403](https://github.com/lambdaclass/stabileo/pull/2403), merged as `24242f7f7` |
| Fixed release | Next release (0.6.4) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`member-diagram-extrema`](../../web/src/lib/provenance/result-changes/member-diagram-extrema.json), [`member-diagram-extrema-design`](../../web/src/lib/provenance/result-changes/member-diagram-extrema-design.json), [`diagram-section-limits`](../../web/src/lib/provenance/result-changes/diagram-section-limits.json), [`diagram-station-refusals`](../../web/src/lib/provenance/result-changes/diagram-station-refusals.json), [`member-diagram-peak-transfer`](../../web/src/lib/provenance/result-changes/member-diagram-peak-transfer.json), [`steel-diagram-moment-gradient`](../../web/src/lib/provenance/result-changes/steel-diagram-moment-gradient.json) |

## Affected features

Planar and spatial member diagrams and envelopes, including short partial
loads, sections next to concentrated forces or couples, and affected
spatial ABS and SRSS combinations. Review concrete spans assembled from
reversed pieces and steel checks that used sampled bending demands or
interpolated moment-gradient inputs.

## What was wrong

A short partial distributed load could have a peak between the diagram
stations. A section immediately after a concentrated action could still
show the value from before the jump. Spatial magnitude combinations
could miss the peak between successive axial point loads or report a
wrong peak when a constituent stored only its full-span load intensities.
These results could be displayed without a warning.

A concrete span assembled entirely from reversed pieces could exchange
the top and bottom bending demands. In the fixed-ended beam reproducer,
reversing the pieces changed a failure at the top support reinforcement
to a passing check on the wrong face. Steel checks could also use a
sampled bending demand or interpolated quarter-point moments that gave
too much moment-gradient credit.
[Diagram and span results](../results-changes/2026-11-member-diagram-extrema.md),
[steel design results](../results-changes/2026-11-steel-diagram-moment-gradient.md).

## How to tell if your model is affected

Check reported peaks for members with short loaded intervals, concentrated
actions or spatial ABS and SRSS combinations. Check the physical tension
face on concrete spans whose pieces run against the span direction,
especially with unequal top and bottom reinforcement. Review steel
checks that use the strong-axis peak and the moments at quarter points
of an unbraced segment.

## Fixed in

Next release (0.6.4). PR [#2403](https://github.com/lambdaclass/stabileo/pull/2403)
evaluates extrema between load boundaries and recovers the two sides of
jumps. It labels conservative bounds where exact magnitude-combination
extrema are unavailable and refuses ambiguous or incomplete design
station data. Reversed pieces use the physical span section axes.
Steel design uses the recovered equilibrium moments where available
and withholds moment-gradient credit when the required chain data
cannot support it.

## Workaround

Verify governing demands from member equilibrium, including load
boundaries and both sides of concentrated actions. Verify the physical
tension face and any moment-gradient inputs independently before relying
on a design check.

## What to do with results you already have

Rerun affected cases and combinations in 0.6.4. Review the governing
force, position and combination, the tension face used for concrete
verification, and the steel demand and capacity. Repeat dependent design
checks and regenerate affected reports.

## Credits and references

See [PR #2403](https://github.com/lambdaclass/stabileo/pull/2403) for the
diagram, steel moment and reversed-span reproducers.
