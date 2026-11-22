### BREAKING (results)

#### Preserve the plate definition when remeshing (#2460, #2461)

Curved boundaries follow the sweep through the plate’s intermediate point. An ambiguous sweep blocks remeshing. Plate meshes carry shell offsets and curvature edits to exactly matching shells and refuse replacement when an edit has no exact match.
