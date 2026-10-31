### Fixed
#### Undo and redo no longer lay a 2D model flat in 3D (2026-10-29)

A model drawn in Basic 2D stands in the X–Z plane when the view turns 3D. Each undo step also
recorded the space view of the moment, and in 2D that was the "as stored" one: undoing in 3D a
step taken in 2D restored it, and the model, still stored with its vertical as Y, lay flat on X–Y,
again with every further undo. A step taken in 2D now records no space view, and restoring it in 3D
chooses the view as switching to 3D does.
