### Performance
#### Reduce repeated work in nonlinear solves (2026-11-18)

Speed up stiffness transformations and reuse bounded P-Delta assembly plans and Cholesky scratch buffers, preserving accumulation order and solver safety checks.
