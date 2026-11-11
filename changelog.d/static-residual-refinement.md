### Changed
#### Improve sparse direct 3D static displacement accuracy (#1753)

Sparse direct 3D static solves refine a compensated residual and refuse unresolved corrections.
This improves the last displayed sub-micrometre digit on an extreme soft-spring model whose
pre-refinement answer retained seven correct significant digits. The regression checks the
stored-matrix answer against an independent decimal reference.

The #1465 loaded-release diagnostic now names the node and rotation. Its Euler control
removes only the incidental strong-plane release and keeps both reference assertions and
tolerances. Main's warned unresolved answer is covered by SA-054. The #983 regression proves
its free truss-end mechanisms and accepts consistent original refusals.
