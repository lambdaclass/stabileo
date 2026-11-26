### Performance
#### Skip the eigenvectors the stability check never reads (2026-11-18)

The conditioning estimate behind the mechanism check runs two Lanczos
iterations and read the mode of the first one only; the second still
accumulated its whole eigenvector matrix. It no longer does. Where the
eigenvectors of the tridiagonal problem are wanted, their columns are kept
contiguous while the rotations are applied. Every value is computed by the
same operations in the same order: a 192-unknown beam solves 28 % sooner and
its results are bit-identical.
