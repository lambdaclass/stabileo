### Fixed
#### Riks–Crisfield evidence matches the CI platform (2026-10-30)

The exact Riks–Crisfield evidence is refreshed on Linux, with the rounding-only difference from
macOS ARM documented (#857). The reference tolerances and reported validation failures are kept;
a platform difference is not treated as a solver correction. Re-check comparisons against the
recorded platform when regenerating the evidence.
