### BREAKING (results)

#### Plate builds share the current solver and bar schedule

Both plate profiles now build the checkout's solver and saved-result notices. Unified PRO can remesh coarse shells and conform neighboring plates. Bar schedules count unused material on the last stock bar of each mark. See [the results change](../docs/results-changes/2026-11-plate-build-and-schedules.md).

Regenerating curved wind pressure also restores the local moment checks used for interior member diagrams.

Declared plates must meet at shared edge nodes in both profiles. Member splits refuse a positive load overlap below the existing geometry limit.
