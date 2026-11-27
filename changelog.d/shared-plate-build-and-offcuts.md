### BREAKING (results)

#### Plate builds share the current solver and bar schedule

Both plate profiles now build the checkout's solver and saved-result notices. Unified PRO can remesh coarse shells and conform neighboring plates. Bar schedules count unused material on the last stock bar of each mark. See [the results change](../docs/results-changes/2026-11-plate-build-and-schedules.md).

Regenerating curved wind pressure also restores the local moment checks used for interior member diagrams.

Declared plates must meet at shared edge nodes in both profiles. Member splits refuse a positive load overlap below the existing geometry limit.

Production drawing again preserves the flat quadrilateral formulation unless curved is explicitly selected.

The published shell panel again counts triangles and quads separately, shows each plate's mesh status and explains how shared nodes transfer load to supporting members. Its mesh display starts on.

The published locale bundles omit the unified shape dialog's instructions when only the node-based inspector is available.

Selecting the owner of a mesh cell in the published shell table now opens that physical plate even when whole-plate picking is already active.

The published raw shell writer now excludes circular plate construction and the unified mesh-adoption undo step.
