### Fixed
#### Landing figures recover after slow chunk loads (2026-11-18)

The carousel skips a slow figure at the two-second deadline. Once its chunk finishes loading, the figure is available for manual selection and later rotations. A rejected load can be retried.
