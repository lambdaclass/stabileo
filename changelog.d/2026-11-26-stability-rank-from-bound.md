### Changed
#### The stability check verifies the rank without a third factorization (2026-11-26)

After bounding the condition number of the scaled stiffness matrix, the stability check
factorized it once more, less a rounding margin, to verify that its rank is resolved. The bound
has already factorized that matrix less a larger shift, so where every margin is under half of
that shift the verification is implied and is no longer run, nor is the matrix with its stored
zeros built for it. In the browser, a slab of 223,000 degrees of freedom solves in 28.5 s
where it took 40.2 s, and needs 1.6 GB where it needed 2.8 GB. A margin over that share is
verified by factorizing as before, so every refusal comes from the same check.
