# SA-2026-072: Roof subdivision changed generated snow loads

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-15; fixed in PR #2175, pending merge and release |
| Issue | [#2144](https://github.com/lambdaclass/stabileo/issues/2144) |
| Fix | PR [#2175](https://github.com/lambdaclass/stabileo/pull/2175); pending merge and release |
| Fixed release | Not released |
| Affected versions | Confirmed on origin/main `8e5c026b7`; earlier introduction and historical release binaries not assessed |
| Re-check registry | [`snow-ridge-mesh`](../../web/src/lib/provenance/result-changes/snow-ridge-mesh.json) |

## Affected features

Generated CIRSOC 104 snow loads whose inferred ridge, representative slope,
side classification or shaped-roof profile depended on roof-member subdivision,
including flat models with an entered roof slope. Snow generation is shared
TypeScript before native/WASM and linear/nonlinear solver selection. The
saved-project regeneration notice applies in 2D, 3D and Pro.

## What was wrong

The generator inferred a ridge by averaging member endpoints near the highest
elevation. Adding nodes changed their multiplicity and could move the ridge
without changing the physical roof. Individual member midpoints and mesh nodes
also affected side classification and shaped-roof interpolation. Generated
loads could change silently under unequal subdivision.

The retained witness is a flat 16 by 4 m perimeter with a gable slope entered
as 20 degrees. On origin/main `8e5c026b7`, subdividing only the first long edge
into eight members makes the opposite short edge receive
0.8076923076923077 instead of 0.40384615384615385 in the first unbalanced
case, without a refusal. The expected pressure is independently calculated
from physical width, entered slope and the documented CIRSOC 104 expressions.
These values come only from the [results-change record](../results-changes/2026-11-snow-ridge-mesh.md).
They are a witness, not an error bound for other roofs. The error is position
dependent and is not assumed conservative.

This is a main-source replay, not a historical release-binary replay. Earlier
introduction and historical release exposure have not been assessed.

## How to tell if your model is affected

Review generated snow loads on roofs with unequal member subdivision, including
entered slopes and shaped roofs. The physical roof should retain its loads when
nodes are inserted on existing straight edges. An earlier successful solve or
absence of refusal does not establish this invariance. The saved-project notice
conservatively selects generated snow loads; it does not prove every selected
roof had an incorrect load.

## Fixed in

Fixed in PR #2175, pending merge and release. One shared
roof-surface model now owns geometry, complete connected collinear runs,
profile points, side classification and interpolation to member stations.
The ridge uses the projected extent of the highest physical profile points;
representative slopes use plane slopes and complete run lengths. Every snow
allocation path uses this representation. Existing engineering inequalities,
geometric matching limits and test tolerances are unchanged.

The separate explicit-panel faceted-dome roof-classification defect is tracked
as #2172 and remains outside this correction. Its known-wrong reproducer is
retained. This fix does not establish end-to-end invariance for that configuration.

## Workaround

Until the correction is merged and released, independently verify the physical
ridge, snow pressures and load allocation, including a subdivision-invariance
check. Do not rely on an earlier generated snow field solely because the solve
completed without refusal.

## What to do with results you already have

After upgrading to a release containing the correction, regenerate affected
snow loads, then rerun analyses, combinations and design checks. Re-solving
stored generated loads alone does not correct them. Review load distributions,
governing cases, member sizing, calculations and deliverables based on the old
loads. Review explicit-panel faceted domes separately under #2172.

## Credits and references

The exposure is tracked as #2144. The coordinator assigned SA-2026-072.
The [results-change record](../results-changes/2026-11-snow-ridge-mesh.md)
retains the main witness, shared-path coverage, boundary tests and correct
controls. The fix is pending merge and release; the coordinator will fill in
the fixing pull-request number.
