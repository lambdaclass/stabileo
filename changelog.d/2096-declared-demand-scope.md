### Fixed
#### Validate each declared combination scope before member and station iteration (2026-11-15)

The pending demand-completeness gate in PR #2173 now declares members and stations within each combination. Variable steel and beam-line checks validate the original request once, then consume verified station groups, including unequal combination grids. Foreign-code checking, certification, EC2 peak design and RC member iteration preserve that proof instead of rebuilding requests. Missing declared inputs still refuse. The held-span regression references now declare the members they actually check and retain every cache, certificate and numerical assertion. See [the results-change record](../docs/results-changes/2026-11-shared-demand-completeness.md) (#2096, #2080).
