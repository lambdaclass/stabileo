### Fixed
#### Plate edits preserve attached point masses and authored geometry

Clearing a plate mesh or deleting a plate preserves nodes used by the model’s mass source. Changing a plate side or closing a hole also keeps geometry nodes supplied by the user. The shape editor removes a detached construction point only when it created the point and the model no longer uses it.

Clearing a mesh or simplifying a deferred slab now preserves authored rigid links. A footprint link shared by two meshes stays until both release it.

With unified plates disabled, the plate inspector accepts existing node IDs for curved sides and hole boundaries. Editing an outside edge now preserves the curve of each untouched opening.
