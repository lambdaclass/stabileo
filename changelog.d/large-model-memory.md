### Changed
#### Modal analysis of large shell models needs about half the memory (2026-11-26)

The check that no mode was skipped kept a list as long as the factor of the stiffness, and
analysed the pattern of a matrix whose pattern the solve had already analysed. The assembly
of the stiffness copied its entries once more than it needed. Six modes of a slab of 396,000
degrees of freedom peaked at 9.3 GB and now peak at 5.1 GB, in 49 s where they took 62 s; the
frequencies are the same to the last bit.
