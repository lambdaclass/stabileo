### Performance
#### Frames and beams pass the stability check without the iterative estimate (2026-11-19)

A linear solve above 64 unknowns first proves its stiffness is well enough
conditioned. The quick proof (two factorizations) only tried a condition number
of 1e6, which slabs meet and ordinary frames and beams do not, so those fell
back to an iterative estimate that took most of the solve. The quick proof now
also tries 1e8 and 1e10, with a factor of 8 in hand on the limits so that it
accepts nothing the estimate would refuse. A 100-storey 2D frame solves in
15 ms instead of 46 ms, a 20-storey 3D frame in 6.4 ms instead of 11.6 ms and a
64-element beam in 0.8 ms instead of 15.6 ms. Results are unchanged.
