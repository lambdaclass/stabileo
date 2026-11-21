### BREAKING (results)

#### Apply planar start couples and refuse ambiguous loads on short projections

Spatial analysis applies a pure, unambiguous legacy planar couple at the start node even when the member projection is too short. Both moment aliases are checked for activity before assembly can omit a legacy load, and combination preparation expands the cases needed for the solve. See [the results changes](../docs/results-changes/2026-11-planar-start-couples.md). (#2411)
