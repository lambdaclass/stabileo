### Changed
#### Large shell models solve up to a third faster (2026-11-25)

The stability check that runs before every solve bounded the largest eigenvalue of the scaled
stiffness matrix by its largest row sum, and then factorized a matrix to confirm the bound. The
bound holds by Gershgorin's theorem and that factorization cannot fail, so it is no longer
run. A slab of 155,000 degrees of freedom solves in 8.8 s where it took 13.0 s; results and
refusals are the same.
