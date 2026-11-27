### Fixed

#### Exercise safety regressions with the intended solver inputs

Staged and comparison tests decode fixtures through the wire format for the analysis they exercise. Fixture loading and saved-result rechecks retain the upstream authored-load checks.
