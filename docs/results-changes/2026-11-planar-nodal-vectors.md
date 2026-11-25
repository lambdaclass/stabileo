# Planar nodal vectors

A planar nodal record can contain a complete vector of forces and moments. For this layout, `fy`, `mx` and `mz` are out-of-plane components. The model loader accepts exactly zero on those components and keeps `fx`, `fz` and `my` as entered. Linear and P-Delta analysis receive the same model as they do from a record containing only those three in-plane components.

Earlier project intake could discard a nonzero out-of-plane component and still return planar reactions. Intake now refuses a complete planar vector with any nonzero or invalid out-of-plane component. A supplied `mx` must also be zero on a shorter planar record. Check the source record and use a spatial nodal load for a force or moment outside the plane.

Shorter legacy planar records still use the alias check for `fy` and `mz`, and spatial nodal loads retain all independent components. The change applies before assembly. Its registry entry covers solve success for the refused layout.
