### Performance
#### Reduce repeated work in linear preparation and gravity load planning (2026-11-12)

The gravity planner indexes nearby panels and roof members while preserving the coverage rules, distance tests and traversal order. Nonfinite grid bounds fall back to the exhaustive scan. Preparing a 3D solve evaluates the known-issue list once. Regression tests compare prepared load cases and gravity planning across model sizes.
