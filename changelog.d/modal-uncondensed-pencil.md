### Changed
#### Modal analysis of shell models no longer grows with the cube of the mesh (2026-11-25)

Since the modal analysis keeps to the physical mass range, it condensed the coordinates
without mass before solving. A shell has one at every node, the rotation about its normal, and
condensing them left a matrix with a dense block: six modes of a slab of 25,000 degrees of
freedom took 147 s. Where few modes of a large model are asked for, the same modes are now
found on the matrix as it is, in 1.7 s, and agree with the condensed ones to rounding. Small
models, and requests for half the finite modes or more, are solved as before.
