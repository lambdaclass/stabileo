### Added
#### GMRES in the engine's linear algebra (2026-11-19)

`linalg::gmres_solve` solves a general square system by restarted GMRES with a
right preconditioner: unsymmetric or indefinite systems, which the conjugate
gradient solver cannot take. It reports the residual recomputed from the
solution and stops unconverged on a step limit, a stagnating restart or a
non-finite number. No analysis uses it yet.
