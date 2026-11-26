# CAD wall joints at exterior beams

## Restore CAD wall joints at exterior beams

A wall end can share a slab mesh vertex and also fall within the CAD snap tolerance of an exterior beam. The draft generator now splits the eligible beam at that wall node, giving the wall, slab and beam a shared joint. Certified slab-to-beam edges stay intact. Vertices created solely for the conforming slab mesh still require an exact intersection.

Regenerate affected CAD drafts and solve again. The restored joint can change load paths, member forces, reactions and displacements.
