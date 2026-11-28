# Loads and properties when simplifying a deferred slab

A grid slab can be subdivided for analysis and later returned to a single panel. Earlier versions read the first cell's loads and properties, removed every cell, and assigned those first-cell values to the entire panel. A pressure or temperature applied only to a different cell disappeared. A load applied only to the first cell could be extended across the panel. The same operation ran during spatial solve preparation when a column footprint required a different mesh.

Simplification now checks all cells before modifying any panel in the requested batch. Shell material, thickness, offset and the complete multiset of loads must agree. Corner-specific pressures and curved cells keep their existing mesh. A refusal names the affected slabs. Uniform loads preserve their case, direction, magnitude, multiplicity and source through simplification and subdivision.

For a project with a deferred grid slab, review any shell loads and offsets edited after subdivision. Compare with the original model if the slab was subsequently simplified or remeshed for a column footprint. Reapply missing edits before analysis. An earlier save may no longer contain the information needed to restore them automatically.
