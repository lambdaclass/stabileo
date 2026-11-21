# SA-2026-096: Static seismic loads could include fictitious storeys or omit inertia along rafters

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2330](https://github.com/lambdaclass/stabileo/issues/2330), [#2331](https://github.com/lambdaclass/stabileo/issues/2331), [#2332](https://github.com/lambdaclass/stabileo/issues/2332) |
| Fix | PR [#2404](https://github.com/lambdaclass/stabileo/pull/2404), merged as `8c324c2a7` |
| Fixed release | 0.6.3 |
| Affected versions | Confirmed in 0.6.2. Earliest affected release is unconfirmed |
| Re-check registry | [`seismic-story-resolution`](../../web/src/lib/provenance/result-changes/seismic-story-resolution.json) |

## Affected features

Automatic static seismic load generation for models with connected brace
intersections, subdivisions of inclined members, or sloped roof rafters.
Analyses, combinations and design checks using the generated seismic cases
are affected.

## What was wrong

The generator could count a brace intersection or a mesh joint as a
storey without a floor there. This changed the distribution of
participating mass and the seismic actions. The connected X-brace
reproducer put seismic force at the brace crossing and returned the wrong
base shear without a warning. Splitting a straight inclined member
also changed the inferred storeys and base shear in 0.6.2.

The generator could put rafter inertia at eave and ridge nodes. Those
nodal forces could leave out the bending and deflection caused by inertia
along the rafter, even when the total storey shear agreed. A rafter force
and deflection check exercises the distributed load on the physical span.
[Results-change record](../results-changes/2026-11-seismic-story-resolution.md).

## How to tell if your model is affected

Check previously generated static seismic cases in frames with shared
brace nodes between floors or inclined members split into shorter
members. Check sloped roofs, including ridges with longitudinal beams
and continuous inclined runs through diaphragm floors. Compare the
inferred storeys with the actual floor elevations and check the load
placement along inclined members.

## Fixed in

0.6.3. PR [#2404](https://github.com/lambdaclass/stabileo/pull/2404) requires
floor evidence at ambiguous joints and refuses when coordinate precision
is insufficient to resolve a subdivision. It distributes static inertia
along elevated rafters where both ends have floor evidence and the load
can be established.

## Workaround

Regenerate the cases in 0.6.3. If generation refuses or an upgrade is
unavailable, use independently verified seismic load cases that account
for the physical storeys, participating mass and inertia along the rafters.

## What to do with results you already have

Replace the earlier generated static seismic cases before rerunning
analyses, combinations and design checks. Review storey and base shear,
overturning, rafter forces and deflections, and update affected reports.

## Credits and references

See [PR #2404](https://github.com/lambdaclass/stabileo/pull/2404) for the
brace, subdivision and rafter reproducers. See
[SA-2026-086](SA-2026-086-seismic-static-story-forces.md) for the related
static seismic corrections and [SA-2026-087](SA-2026-087-seismic-modal-load-generation.md)
for modal load generation.
