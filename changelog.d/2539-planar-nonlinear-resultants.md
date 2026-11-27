### BREAKING (results)
#### Preserve load resultants, displacement ties and forward arc steps (2026-11-24)

Planar nonlinear solvers sum load contributions before applying continuation
factors and use those resultants for both equilibrium and force recovery.
Co-rotational corrections reconstruct tied displacements from the current
master positions. Arc-length analysis retries a backward equilibrium point
from the last accepted state.
