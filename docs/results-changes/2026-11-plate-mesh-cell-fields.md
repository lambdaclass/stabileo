# Preserve cell loads and stiffness when editing a plate mesh

The plate panel and edits to a touching arc could remove a mesh along with its individual shell loads and local shell properties. Even a pressure repeated identically on every slab cell could disappear. Replacing an otherwise identical mesh could reset an edited cell’s material and thickness to the parent plate’s values.

The mesh removal command checks every selected plate before changing any of them. It can retain a uniform pressure in its original case as a whole-plate load. It keeps the existing mesh when a pressure or thermal load, a load definition selecting individual cells, or a local material, thickness, offset or curvature requires those cells. Remeshing carries local properties only when the edited cells have the same footprint and orientation after replacement.

For a project edited with an earlier build, compare the current pressure assignments and shell properties with the authored model before rerunning analysis. A saved file written after an assignment disappeared may contain no record from which to recover it.
