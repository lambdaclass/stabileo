# Deferred slab meshes in design resizing

An intermediate integration build solved an ordinary saved deferred slab as its original coarse panel between design resizing rounds. The manual analysis and the released resize both subdivided it. The four-corner regression specifies a 0.5 m mesh on a 4 m by 3 m panel. The ordinary PRO design now solves all 48 cells. Basic 3D prepares the same mesh and refuses the unsupported shells.

Repeat any sizing run made with a deferred slab in an affected integration build. Both solve paths now run the same footprint and mesh preparation before propagating loads. Where a column footprint would require discarding a cell-specific load, resizing stops with the translated refusal and clears old spatial results.
