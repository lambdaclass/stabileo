# Rectangular plate meshes keep their quads at shared stations

## Rectangular plate meshes keep their quads at shared stations (2026-11-20)

During a unified PRO remesh, a neighbour could add column-footprint nodes along the edge of a rectangular slab with an opening. The shared-station pass split its edge cells into triangles. In the seven-storey example, cutting the rectangular opening in slab L2 reduced the applied mesh's minimum angle from 90° in the plan to 14.036°.

The batch first tries to add the required stations as lines in the existing rectangular grid. It shares the new edge stations with adjacent shells before applying any mesh. If the stations cannot fit into a valid rectangular grid within the mesh limits, the batch uses the existing conforming transition cells. With no additional station, it uses the original grid. Remeshing an affected plate can change shell connectivity, displacements, reactions, member forces and shell stresses.
