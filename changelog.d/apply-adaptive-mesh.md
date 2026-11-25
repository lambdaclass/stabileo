### Added
#### Applying the adaptively refined mesh to the model (2026-11-25)

The "Advanced: adaptive mesh refinement" section of the discretization panel can now apply
the mesh it reports to the model, as one undo step. Each split shell is replaced by its
parts, which keep its material, thickness, loads and groups; members along split edges are
cut; the nodes left in the middle of an edge are tied with linear constraints. It is refused
for plates meshed from their outline, whose mesh is remade from the outline.
