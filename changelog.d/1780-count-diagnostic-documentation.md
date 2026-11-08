### Fixed

#### Classify the inclined-support count correction as diagnostic (2026-11-08)

The inclined 3D restraint-count correction in PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780) retains its [results-change write-up](../docs/results-changes/2026-11-inclined-3d-restraint-directions.md) and registry entry, with a brief mention in [SA-2026-049](../docs/advisories/SA-2026-049-support-spring-conflicts.md). The degree-of-indeterminacy count is a diagnostic, not a design result, so its separate safety advisory and summary-table rows have been removed.
