# SA-2026-112: Basic 3D could silently omit all shell elements

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-24 |
| Issue | [#2535](https://github.com/lambdaclass/stabileo/issues/2535), item 2 |
| Fix | PR [#2548](https://github.com/lambdaclass/stabileo/pull/2548), merged as `b9c70399f` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Main from `ed3042c66` (2026-03-14) up to the fix, including tagged releases 0.2.0 through 0.6.4. Reproduced at `b78c25769` |
| Re-check registry | [`warped-quad-containment`](../../web/src/lib/provenance/result-changes/warped-quad-containment.json) |

## Affected features

Basic 3D web analysis of models containing shell elements, including
meshed slabs. The affected paths include single load cases, prepared
analyses, and load combinations.

## What was wrong

Basic 3D dropped the shell collections while building the solver input.
It could return displacements, reactions and member forces for the frame
alone without flagging the omitted shell stiffness. The result could
satisfy global reaction balance for the loads the solver received.

In the seven-storey building regression, the pre-fix Basic 3D solve
omitted all 189 slab quads and returned no shell stresses. All three
reaction balance assertions still passed. Removing the shells from the
same model gave identical Basic 3D results and diagnostics. The PRO 3D
solve included all 189 quads, recovered their stresses and returned
different displacements.

[Results-change record](../results-changes/2026-11-warped-quad-containment.md).

## How to tell if your model is affected

Check whether a model you solved in Basic 3D contains shell elements,
including plates or quads used to mesh slabs. A balanced reaction sum
can occur even when the analysis omitted those elements.

## Fixed in

The next release after 0.6.4. PR
[#2548](https://github.com/lambdaclass/stabileo/pull/2548) refuses a Basic
solve when the model contains shells and directs users to PRO 3D.

## Workaround

Open the full model in PRO 3D and verify that its shell elements are
included before using the results. Resolve any shell diagnostics before
using a new analysis for design.

## What to do with results you already have

Rerun affected load cases and combinations in PRO 3D with the complete
shell mesh. Review the displacements, reactions and member forces, check
the recovered shell results, repeat dependent design checks and
regenerate affected reports.

## Credits and references

See [issue #2535](https://github.com/lambdaclass/stabileo/issues/2535) for
the original report and [PR #2548](https://github.com/lambdaclass/stabileo/pull/2548)
for the containment and
[seven-storey regression](https://github.com/lambdaclass/stabileo/blob/03b8fe9c9b696476b121a64c542f75e95f96b5b3/web/src/lib/model/building/__tests__/building-closing.test.ts).
