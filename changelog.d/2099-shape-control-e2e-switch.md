### Fixed
#### Research shape-control E2E switch coverage (2026-11-15)

- Run the optional shape-control load, distribution and Hungarian checks only when the served build enables research. Keep the published replay and corner-control checks active with switches off, and verify test selection against both runner and prebuilt build switches (#2099).
