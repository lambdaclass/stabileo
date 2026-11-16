### Fixed
#### Retain every observed station in demand coverage (2026-11-16)

The pending completeness gate in PR #2173 now records observed stations within their combination even when a common grid is declared. Removing a combination-only station after conversion now refuses instead of checking the remaining demands. Common grids, per-combination declarations and cached coverage share the same monotone inventory builder. The legacy missing-Fu test supplies a complete concurrent scope and still asserts the material refusal. See [the results-change record](../docs/results-changes/2026-11-shared-demand-completeness.md) (#2096).
