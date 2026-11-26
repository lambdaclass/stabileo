# Certified CAD bearings and adjacent roof snow drift

## Preserve the certified beam edges in CAD drafts

The triangular slab mesh certifies a chain of shared edges along each bearing beam. A wall node near the beam could be used as a split point under the CAD snap tolerance, bending the beam away from the certified mesh. The wall could still support the slab and let analysis run after the intended beam load path was lost.

Beam descendants retain the original certified trace during splitting. The draft must have a member edge with the same two node IDs as each certified slab edge before generation can finish. Regenerate affected CAD drafts from their source plans and rerun analysis. Restoring the connection can change displacements, member forces and reactions.

## Use continuous fetch and check clear snow drift spans

A measurable joint between coplanar bays interrupts the fetch. The generator keeps the drift strip over any clear span above geometric roundoff after it clips intervening roofs. When the separation varies along opposed roof edges, a clear in-range span below a higher modeled roof produces the existing snow transfer refusal. The supported uniform-separation calculation continues to use the physical gap width.

Regenerate generated snow cases before rechecking affected projects. Fetch and clear span corrections can change the surcharge and its bearing reactions. A skewed transfer can make the plan block until the load can be represented.

The edge checks use the elevation bounds of the authored roof surfaces and require the existing minimum overlap for a coincident seam to extend fetch. See the [valley and short-seam regression](2026-11-rafter-gap-width-and-valley-snow.md#preserve-valid-snow-generation-at-roof-valleys-and-short-seams).
