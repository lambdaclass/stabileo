# SA-2026-107: Plate remeshing could discard shell offsets and curvature edits

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2461](https://github.com/lambdaclass/stabileo/issues/2461) |
| Fix | PR [#2466](https://github.com/lambdaclass/stabileo/pull/2466) (containment), merged as `72779e3ea` |
| Fixed release | the next release after 0.6.3 (containment) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`physical-plate-remesh`](../../web/src/lib/provenance/result-changes/physical-plate-remesh.json) |

## Affected features

PRO models with physical plates remeshed after a shell offset or
curvature edit. In the reported workflow, the user selects an
individual shell with the Selection panel's element scope and edits
the property in Specifications.

## What was wrong

Remeshing deleted the old shells and rebuilt them using the plate
material and thickness, dropping individual shell offsets and
curvature edits without a warning.

In the production 4 m square plate reproducer, with four supported
corners and 1 kN/m² pressure, losing one quad's offset changed the
peak vertical displacement from 5.190070624 µm to 5.883428571 µm.
Neither solve reported a diagnostic.
[Results-change record](../results-changes/2026-11-plate-remesh.md).

## How to tell if your model is affected

Compare the shells in plates remeshed after a Specifications edit
with the intended offset values, reference axes and curvature
settings. Use a pre-remesh copy or the original specifications to
identify any missing edits.

## Fixed in

Containment ships in the next release after 0.6.3. PR
[#2466](https://github.com/lambdaclass/stabileo/pull/2466) transfers an
edit only to a unique replacement cell with exactly the same welded
nodes and orientation. It keeps the original corner order so local
offsets keep their reference axes. If an edited shell has no exact
match, remeshing stops, keeps the existing mesh and identifies the
plate. Edits already erased from saved models must be restored from
the intended specifications or a pre-remesh copy.

## Workaround

Apply and verify shell offsets and curvature on the final mesh. If
remeshing is needed, record the intended shell properties first,
then reapply and verify them on the replacement mesh before solving.

## What to do with results you already have

Restore or reapply the intended shell edits before rerunning affected
analyses and combinations. Review displacements, repeat dependent
design checks and regenerate affected reports.

## Credits and references

See [issue #2461](https://github.com/lambdaclass/stabileo/issues/2461)
and [PR #2466](https://github.com/lambdaclass/stabileo/pull/2466) for the
offset and curvature reproducers.
