### Fixed
#### Check plastic history disclosures by diagnostic identity (2026-11-14)

Require the exact certificate-mismatch diagnostic in the pushover regression without changing its collapse-factor assertion. Compare exported bundle diagnostics with incremental diagnostics through one helper that excludes only certificate disclosures, cover within-certificate history through both native public APIs, and document the benchmark's current disclosure contract (#2084).
