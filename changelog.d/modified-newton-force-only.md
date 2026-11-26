### Changed
#### Avoid unused frame tangents in experimental 3D Modified Newton (2026-11-26)

With prepared members and a kept factor, evaluate forces through the same
kernel without rebuilding frame tangents. Keep full assembly when no factor
or preparation is available, and retain residual, convergence and branch checks.
