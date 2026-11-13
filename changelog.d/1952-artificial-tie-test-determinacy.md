### Fixed

#### Check determined values for member-free staged ties in both dimensions (#1952)

The artificial-tie regression now checks the prescribed displacements and zero
reactions and constraint forces against hand values in 2D and 3D. Independent
elimination of the input support and tie equations proves rank 6 of 6 and 12
of 12; removing any single tie DOF leaves one undetermined motion. The previous
expectation of an unavailable-result warning encoded behavior superseded by
round 23. The loaded rigid-link regressions likewise check transferred forces
and the support moment derived from the input load and offset. Engine code, numerical results and tolerances are unchanged.
