# SA-2026-101: PRO could solve with omitted plates or disconnected wall–slab junctions

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2368](https://github.com/lambdaclass/stabileo/issues/2368), [#2376](https://github.com/lambdaclass/stabileo/issues/2376), [#2388](https://github.com/lambdaclass/stabileo/issues/2388) |
| Fix | PR [#2409](https://github.com/lambdaclass/stabileo/pull/2409), merged as `0c0413a9e` |
| Fixed release | Next release (0.6.4) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`plate-analysis-conformity`](../../web/src/lib/provenance/result-changes/plate-analysis-conformity.json) |

## Affected features

PRO models with invalid or incomplete physical plates, meshes made from
malformed outlines or holes, and shell junctions with unmatched nodes.
The seven-storey gallery building is an affected example.

## What was wrong

Analysis could omit an invalid plate and publish results for the remaining
structure without identifying the omission. In the reproducer, preparation
reported success and analysis returned reactions for the loaded slab
while leaving out a second plate made invalid by a corner edit. An old
mesh could also remain in use after its plate definition changed.

The mesher could discard invalid outline node IDs or an incomplete hole,
or interpret a blank circle coordinate as zero. Apply could create a
mesh for a different shape without a warning.

A wall node could lie on a slab edge without sharing a slab vertex or
being constrained to follow the slab edge. The reverse could also occur.
In the seven-storey example the wall node and the adjoining slab edge
moved by different vertical amounts at the same location. This can change
the load path, displacements and member demands.
[Results-change record](../results-changes/2026-11-plate-analysis-conformity.md).

## How to tell if your model is affected

Compare the intended plate outlines and openings with the actual shell
mesh. Check plates edited after meshing for missing or stale cells. Check
wall–slab junctions for shared nodes or verified constraints that enforce
compatibility. A shared diaphragm alone does not establish vertical
continuity at the junction.

## Fixed in

Next release (0.6.4). PR [#2409](https://github.com/lambdaclass/stabileo/pull/2409)
blocks incomplete mesher inputs and refuses analysis when the plate mesh
is invalid, stale or incompatible at a shell junction. Automatic meshing
can rebuild a stale mesh during preparation. The updated seven-storey
gallery example shares wall and slab nodes at the core.

## Workaround

Correct the affected plate definitions and regenerate the meshes. Use
shared nodes or independently verified compatibility constraints at
wall–slab junctions. Check the resulting mesh against the intended
geometry before using analysis results.

## What to do with results you already have

Reload the corrected gallery example or repair affected projects and
rerun analysis, combinations and design checks. Review displacements,
load transfer, member demands and any reports based on the earlier mesh.

## Credits and references

See [PR #2409](https://github.com/lambdaclass/stabileo/pull/2409) for the
invalid-plate, malformed-mesher-input and wall–slab junction reproducers.
