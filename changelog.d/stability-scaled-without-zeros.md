### Changed
#### The stability check no longer factorizes a matrix half made of zeros (2026-11-25)

The matrix the stability check scales and factorizes stored, as entries, the zeros of every
node block: over half of it in a slab or a wall along the axes. It is now built without them
where they are at least a quarter of it, with the same values. With the change before it, a
slab of 155,000 degrees of freedom solves in 6.5 s where it took 13.7 s. A model whose bound
the fast path cannot certify is checked on the matrix as it was.
