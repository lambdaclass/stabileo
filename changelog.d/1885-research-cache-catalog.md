### Fixed
#### Recognize the bent-strip solver in the required research CI check (2026-11-10)

The Research catalog check now expects the Fehér, Sipos & Várkonyi bundle already registered in CI. Its engine-dependency and cache-invalidation checks include that crate, so its own inputs invalidate its cache while shared engine inputs invalidate every bundle. Solver code and computed results are unchanged.
