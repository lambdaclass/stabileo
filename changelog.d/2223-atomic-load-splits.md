### Fixed
#### BREAKING (results): Refuse load-changing rounded splits atomically (2026-11-16)

Validate a complete member split before changing nodes, sections, members, loads, identifiers or undo history. Refuse distributed-load remapping when a generated child's geometric length differs from its source span, instead of stretching the load coordinates and changing its resultant and first moment. Preserve overflow errors through planar combination assembly so an invalid combination cannot disappear from an otherwise successful result. Scope the compensated-force notice to models with structural stiffness. See [the results-change record](../docs/results-changes/2026-11-atomic-load-splits.md) (#2223, #2222).
