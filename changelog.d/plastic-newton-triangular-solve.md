### Fixed
#### Solve plastic Newton directions without an explicit inverse (2026-11-14)

- Solve the 3D plastic proof search's Newton systems through a full-rank triangular factor instead of multiplying an explicit inverse. Traverse simplex pricing rows contiguously with the original summation order. Preserve exact proof checks and pin successful narrow certificates for every historical plastic fuzz fixture (#2084).
