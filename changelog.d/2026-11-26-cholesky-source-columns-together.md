### Changed
#### The sparse factorization takes four source columns in each pass (2026-11-26)

The Cholesky factorization subtracted from a column one source column at a time, rereading and
rewriting the column for each. It now goes column by column and subtracts four sources in one
pass, each entry taking the same subtractions in the same order, so the factor is the same bit
for bit. A linear solve of a slab of 223,000 degrees of freedom takes 21.6 s where it took
34.0 s, and in the browser about 34 s where it took 74 s.
