### Fixed
#### A 3D load session retains a successful loaded preparation retry (2026-11-10)

If preparation without the initial loads fails, a successful retry with those loads now creates the session. If both attempts fail, the original preparation error is retained. The linear-stability documentation also distinguishes the solved axis-aligned #1496 cantilever from its refused coupled orientation and discloses corrected PCG components and sparse direct residual refinement.
