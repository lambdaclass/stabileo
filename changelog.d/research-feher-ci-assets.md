### Fixed
#### Ship the bent-strip solver with CI-built sites (2026-11-10)

CI now builds and caches the Fehér, Sipos & Várkonyi research solver alongside the other research bundles, so changing its actuator path can run the live solver instead of failing to load its manifest. Third-party notices include the dependencies resolved by its locked Cargo tree. The gallery smoke test now checks this paper's pending review status, matching the catalogue and unit tests.

The solver equations, recorded results, numerical assertions, and route budgets are unchanged.
