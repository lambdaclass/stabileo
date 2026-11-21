### BREAKING (results)

#### Refuse stale plate meshes and uncoupled wall–slab endpoints in PRO (#2409)

Direct and advanced analysis now stop when a plate's mesh is out of date, including after an outline edit that leaves the old shell IDs in place. A wall and slab must share node IDs at coincident endpoints along overlapping edges. The architecture-only DXF example now shares these nodes and produces revised displacements and member forces.
