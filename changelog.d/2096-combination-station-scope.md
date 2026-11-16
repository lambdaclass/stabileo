### Fixed
#### Preserve complete combination-specific design station sets (2026-11-15)

The pending demand-completeness gate in PR #2173 now keeps common requested stations separate from combination-specific stations. Complete sizing cases and EC2 checks with extra stations in only one combination retain their answers. Verified coverage survives tuple conversion, and undefined optional governing references produce complete checks or typed incomplete-demand refusals instead of a crash. Missing declared combinations, members and stations still refuse. Design result snapshots are unchanged. See [the results-change record](../docs/results-changes/2026-11-shared-demand-completeness.md) (#2096).
