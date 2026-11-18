### Performance
#### Apply sparse Cholesky updates a stretch of rows at a time (2026-11-18)

The sparse factorization subtracted each earlier supernode's contribution one
entry at a time through two index lists, which was 85 to 90 % of its time. The
rows an update touches come in contiguous stretches, so each stretch is now
subtracted as one pass over adjacent memory. Every entry receives the same
subtractions in the same order and the factor is bit-identical. A 136,000
unknown plate factors in 1.4 s where it took 6.6, and a 92,000 unknown
building frame in 62 s where it took 170.
