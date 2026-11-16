### Fixed
#### BREAKING (results): Exact partial-load bounds and width validation (2026-11-16)

Native and web adapters validate partial-load bounds and the relative geometry limit before using a load. Sub-limit intervals at either member endpoint are refused, including adjacent representable endpoints. Independent applied-force checks preserve the existing wrench-balance verdict. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2222, #2223).
