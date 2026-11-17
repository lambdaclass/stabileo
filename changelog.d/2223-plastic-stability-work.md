### Fixed
#### Reduce stability-analysis work during plastic collapse (2026-11-17)

Small dense stability checks reuse the first Jacobi decomposition when a mechanism mode is needed. Matrix rotations traverse rows directly, retaining the parent arithmetic order and exact numerical results. This reduces work in the generated plastic-collapse CI regression without changing its timeout, sampling, conditioning limits, or assertions (#2223).
