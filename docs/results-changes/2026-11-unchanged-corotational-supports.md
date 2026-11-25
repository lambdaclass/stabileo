# Preserve unchanged support positions in planar co-rotational continuation (2026-11-24)

PR #2539, following issue #2510. Both planar co-rotational drivers now use the
exact prescribed position throughout a continuation when the start position
and target position agree. Adding two separately rounded weighted values
could change an otherwise constant position by a representable increment.
The solver treated that difference as support motion and forced a correction.

The end-clamped strip validation case starts from an equilibrated bent state
and repeats its support positions. The continuation now reaches full load
with the same nodal displacements even with one Newton iteration per
increment. A support that actually moves still uses the endpoint-exact load
ramp and the existing equilibrium check.
