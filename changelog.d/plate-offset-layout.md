### Fixed

#### Check shell offsets against the requested analysis geometry (2026-11-28)

Plate accounting now checks whether the analysis requested the original shell nodes or an expanded offset. It refuses a physical plate whose assembled position misses the requested shift beyond the existing geometry tolerance.
