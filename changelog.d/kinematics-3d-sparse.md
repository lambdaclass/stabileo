### Changed
#### The 3D kinematic analysis no longer takes minutes on a model of a thousand nodes (2026-11-25)

The analysis that says whether a 3D model is a mechanism, and names the degrees of freedom
that move, assembled the stiffness matrix dense and eliminated it, at a cost that grows with
the cube of the model. A slab of 1,089 nodes took 78 s; it takes 0.1 s, and one of 16,641
nodes, which could not be analysed at all, takes 5 to 10 s. Models of up to 1,500 free
degrees of freedom keep the names they had for a mechanism's degrees of freedom.
