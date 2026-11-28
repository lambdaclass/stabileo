### Fixed

#### Preserve cell loads and stiffness when editing a plate mesh (2026-11-28)

Removing a mesh now retains uniform plate pressures and stops when individual cells carry loads or properties that would be lost. The same checks apply when changing a touching arc. Remeshing preserves compatible local stiffness changes.
