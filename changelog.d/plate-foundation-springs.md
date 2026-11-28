### Fixed

#### Preserve foundation stiffness when remeshing a physical plate (2026-11-27)

Reapplying soil springs to a whole plate records which supports belong to its mesh. Refining or reopening the model preserves the total foundation stiffness. Inconsistent saved spring assignments block analysis.
