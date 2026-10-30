### Changed
#### The deformed shape writes its displacements only when asked (2026-10-29)

The deformed shape wrote every node's displacement on the drawing, under the same "show values"
switch as the diagrams. It now has its own switch, off by default: in Basic 2D and 3D a "Show
displacements" check beside Animate, under the scale slider (on a phone too); in PRO's deformed
view it takes the place of "Show loads". The other results keep their values on.
