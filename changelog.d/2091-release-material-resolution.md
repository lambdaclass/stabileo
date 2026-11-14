### Fixed
#### Legacy fixture materials resolve against historical defaults (2026-11-14)

Release example references install their recorded material and section defaults before fixture resolution, so future default name or stiffness changes cannot alter material reuse or member references. The numeric fingerprint edge-case test retains its synthetic null and undefined inputs under strict typechecking. No engine result, tolerance or saved project changes (#2091).
