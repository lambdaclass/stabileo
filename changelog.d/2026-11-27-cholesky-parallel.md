### Changed
#### Native builds can factorize on several threads (2026-11-27)

With the `parallel` feature, which the web build does not use, the sparse Cholesky
factorization spreads independent subtrees of its supernode tree over threads, and the widest
supernodes over blocks of columns. Every supernode takes its updates in the same order as on
one thread, so the factor is the same bit for bit whatever the number of threads. On four
threads a slab of 223,000 degrees of freedom factorizes in 0.73 s where it took 1.99 s, and six
floors on columns, 152,000 degrees of freedom, in 0.53 s where it took 1.36 s.
