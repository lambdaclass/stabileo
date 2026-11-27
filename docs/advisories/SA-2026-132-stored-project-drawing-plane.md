# SA-2026-132: Reopened planar projects could solve in the wrong drawing plane

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-26 |
| Issue | Saved drawing-plane findings in [#2588](https://github.com/lambdaclass/stabileo/pull/2588) |
| Fix | PR [#2588](https://github.com/lambdaclass/stabileo/pull/2588), merged as `bcf4aab49` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | From at least 0.2.0 through 0.6.4. The separate drawing-plane state and plane-dependent Basic solve shipped by 0.2.0 (`f5b697fee`, `f0761838f`); reopening a saved model left that choice outside the model. |
| Re-check registry | [`legacy-planar-project-plane`](../../web/src/lib/provenance/result-changes/legacy-planar-project-plane.json) |

## Affected features

Basic analysis after reopening a project or shared model that did
not store its drawing plane. The selected plane can change the
projected geometry, loads, restraints and the global directions
of reported reactions. Even an X-aligned beam that looks the same
in XY and XZ can be affected.

## What was wrong

Opening a legacy model could leave the plane selected in the workspace
or use the XY default. Basic could solve in that plane without asking
the user to confirm it. In the directional support reproduction, an
X-aligned beam with a stored global Z restraint at the tip returned
zero transverse tip reaction when reopened and solved in XY. In the
intended XZ model the restraint was active and carried a nonzero
reaction. A legacy guided support could also report its transverse
reaction along global Y in XY, when the author's XZ model put the same
reaction along global Z. In the spring reproduction, using XY
selected a different transverse spring stiffness and changed the tip
displacement under the same load.

[Results-change record](../results-changes/2026-11-legacy-planar-project-plane.md).

## How to tell if your model is affected

Check the plane used for Basic analysis of an older saved project or
share link. Compare member spans, the axes of loads and reactions, and
the directions of support restraints and springs with the original
model. For a model along the global X axis, verify the transverse
direction explicitly. The member geometry alone can be consistent
with both XY and XZ.

## Fixed in

The next release after 0.6.4. PR
[#2588](https://github.com/lambdaclass/stabileo/pull/2588) restores a
saved plane and infers the plane of an older model when the input
establishes it. Basic blocks analysis and asks for a plane when the
choice can affect the result and the saved model leaves it ambiguous.
The chosen plane is saved with the project.

## Workaround

After opening a project or share link, explicitly select the original
drawing plane before solving. Verify the directions of the loads,
restraints and springs against the source model.

## What to do with results you already have

Reopen affected models, confirm the intended plane and check the
prepared model before saving and rerunning the affected Basic analyses
and combinations. Rebuild any dependent envelopes, repeat design
checks and update reports.

## Credits and references

See [PR #2588](https://github.com/lambdaclass/stabileo/pull/2588) and the
[saved-plane regressions for directional supports and shared models](https://github.com/lambdaclass/stabileo/blob/bcf4aab49/web/src/lib/store/__tests__/recheck-unrelated-project-2223.test.ts).
