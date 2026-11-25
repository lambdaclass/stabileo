### Changed
#### Refresh the Newton-Krylov preconditioner after exact corrections (2026-11-25)

The experimental 2D and 3D co-rotational solvers now retain the current SPD
tangent factor after an exact correction, so the next Newton-Krylov solve uses
that factor as its preconditioner instead of the increment's initial tangent.
Non-SPD tangents keep the existing LU fallback, and correction results are
unchanged. Default builds remain unaffected.
