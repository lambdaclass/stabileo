### Added
#### Plate results: forces per unit width, faces, principal moments and directions, averaged per plate (2026-11-02)

The shell contour offers the membrane forces Nx, Ny and Nxy per unit width, the transverse shears
Vx, Vy and Vmax (where the elements give them) and the principal moments Mmax and Mmin. Stresses
can be read on the mid-surface, on the top or bottom face, or on the more stressed face; by default
Von Mises is read on the more stressed face, as before, and the other stresses on the mid-surface,
where Von Mises is that of the membrane stresses alone. At the nodes, values (Von Mises too) average over the
whole model, within each physical plate, or within each group, so a wall and the slab it meets keep
their own values at their common edge. The principal directions can be drawn on each element, in red
where they pull and blue where they push, and the largest and smallest values written on the
model. Hovering a shell reads its value and the span its corners are painted with. The legend, the
results along a line and the exported figures read the same field.
