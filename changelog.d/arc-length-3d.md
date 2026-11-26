### Added
#### Arc-length analysis of 3D frames, as an opt-in engine feature (2026-11-24)

With the `experimental-nonlinear` Cargo feature,
`solver::experimental_nonlinear::solve_arc_length_3d` follows the equilibrium
path of a 3D frame or truss past its limit points, as `solve_arc_length` does
in 2D. It refuses what 3D co-rotational analysis refuses. Default builds and
the web app are unchanged.
