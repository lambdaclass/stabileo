# SA-2026-127: Slabs could pass no load to walls at unmeshed junctions

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-26 |
| Issue | [#2430](https://github.com/lambdaclass/stabileo/issues/2430), [#2429](https://github.com/lambdaclass/stabileo/issues/2429) (CAD exposure) |
| Fix | PR [#2580](https://github.com/lambdaclass/stabileo/pull/2580), merged as `58906215a` |
| Fixed release | the next release after 0.6.4 (containment) |
| Affected versions | Manually meshed spatial shells could lack a compatible interior junction from the first numbered release, 0.2.0 (`275587934`). Meshed CAD drafts also date to 0.2.0 (`3a0e5d6b8`). The interior-contact gap remained in 0.6.4 after the shell endpoint checks and CAD mesh changes (`15988b205`, `92bb63c13`). The oblique CAD case was reproduced with the mesher shipped in 0.6.4. |
| Re-check registry | [`wall-slab-interior-contact`](../../web/src/lib/provenance/result-changes/wall-slab-interior-contact.json) |

## Affected features

PRO spatial analysis of shell walls intended to support or connect to a
slab where the meshes lack shared connectivity along part or all of the
intended junction.
This includes saved and manually meshed models and oblique walls in
CAD-generated meshes, in both fixed-division and target-size modes.

## What was wrong

The junction check looked for shell vertices on opposing edges. It
could miss a wall ending inside a slab cell, a wall face piercing the
slab, or a crossing at an internal slab mesh edge with no shared
station. Even two shared corners can leave a diagonal junction
unconnected between them. Analysis could return results without a
warning about the missing connection. The slab load could reach other
supports, so total reaction balance could still pass.

In the regression, a 4 × 4 m slab under 1 kN/m² returned 16 kN of total
vertical support reaction and zero vertical reaction at both wall bases.
This occurred with the wall ending at the slab and with the wall crossing
through it. In the oblique CAD example, the generated meshes shared
isolated nodes and no edges. Both meshing modes returned a result.

[Results-change record](../results-changes/2026-11-load-accounting-and-wall-contact.md#wallslab-mesh-contact).

## How to tell if your model is affected

Compare the intended wall–slab junction with the actual analysis mesh.
Trace the entire intersection, including where it crosses an internal
slab mesh edge. Check that the meshes share compatible edges throughout
the intended junction.
Inspect CAD-generated diagonal walls even where the two meshes share
some node IDs. Review the distribution of reactions and wall forces under
slab loading.

## Fixed in

The next release after 0.6.4. PR
[#2580](https://github.com/lambdaclass/stabileo/pull/2580) stops affected
spatial solves before returning results and identifies the wall and slab.
The wall and slab must have shared mesh connectivity along the entire
intended junction.

## Workaround

Subdivide both surfaces along the intended junction and share mesh edges
along its length. Verify that the new mesh retains the intended loads,
supports and constraints. If the surfaces are intended to be separate,
verify that their modeled clearance reflects that intent.

## What to do with results you already have

Review affected models, including saved CAD drafts. Repair their meshes
and verify the load path before rerunning spatial load cases and
combinations. Review wall forces, slab demands, support reactions and
displacements. Rebuild envelopes and repeat dependent design checks and
reports.

## Credits and references

See [issues #2430](https://github.com/lambdaclass/stabileo/issues/2430)
and [#2429](https://github.com/lambdaclass/stabileo/issues/2429),
[PR #2580](https://github.com/lambdaclass/stabileo/pull/2580), the
[wall–slab regressions](https://github.com/lambdaclass/stabileo/blob/58906215a/web/src/lib/engine/__tests__/plate-analysis-containment.test.ts)
and the [CAD regression](https://github.com/lambdaclass/stabileo/blob/58906215a/web/src/lib/cad/__tests__/cad-draft.test.ts).
