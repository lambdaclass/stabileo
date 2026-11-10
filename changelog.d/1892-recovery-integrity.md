### Fixed

#### Cap axial recovery allowances and preserve harmonic integrity checks (2026-11-10)

Reject buckling accuracy certificates when recovered axial forces differ from the verified displacement-based forces beyond the existing static accuracy ceiling and independent geometry and action bounds. Validate the harmonic modal residual even when the optional accuracy estimate is absent. Correct the shared #1369/#1370 regression documentation. These changes affect verification only; production engine results and the results-change registry are unchanged.
