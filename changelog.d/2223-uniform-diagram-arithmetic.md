### Fixed

#### Preserve ordinary uniform-load diagrams

- Preserve the prior arithmetic for ordinary uniform distributed-load diagrams in the shared 2D/3D recovery helper, restoring the steel pipe-rack governing stations and the three-member memoria without changing snapshots or tolerances. Extreme geometric products still use the slope-free integration that avoids overflow and cancellation (#2223).
