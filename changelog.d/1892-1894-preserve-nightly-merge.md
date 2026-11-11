### Fixed

#### Preserve both nightly regression blocks when merging PR #1894 into PR #1892 (2026-11-10)

Keep the analysis-accuracy, retained-failure, and dynamic-mirror checks alongside the effective-mass and shell-stress integrity checks and unresolved regressions. Preserve every test, held cell, assertion, ignore, and comparison tolerance from both branches. This merge adds no engine result changes.
