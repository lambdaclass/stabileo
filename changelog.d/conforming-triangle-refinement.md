### Added
#### Local refinement of DKT triangle meshes (2026-11-25)

Adaptive refinement now refines meshes of DKT triangles where the error is, as it does MITC4
quads, instead of everywhere. A triangle is split by the edges that get a node, always
together with its longest edge, into two, three or four triangles: the mesh stays conforming
with no constraints, and its angles stay bounded. Uniform refinement, and so the convergence
check, is unchanged.
