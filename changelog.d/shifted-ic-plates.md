### Fixed
#### The incomplete Cholesky preconditioner works on plates (2026-11-19)

On a shell model the shifted incomplete Cholesky preconditioner overflowed and
returned NaN, so a solve that asked for the conjugate gradient method fell back
to the Jacobi preconditioner. When the factor overflows it is now rebuilt on the
matrix scaled to a unit diagonal, with a small diagonal shift and ten extra
entries per column. On a 50x50 plate the conjugate gradient solve takes 48
iterations instead of Jacobi's 495, and 75 ms against 152 ms. Models where the
preconditioner already worked get the same factor as before. The default
direct solver is not affected.
