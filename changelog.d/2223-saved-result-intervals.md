### Fixed
#### BREAKING (results): Validate saved intervals and rounded subdivision loads (2026-11-16)

Refuse invalid saved member-load intervals before envelope, combination, station, section-stress and certified-demand evaluation. Enforce full bounds in member-deflection recovery and remap subdivided partial loads to each child's actual geometric length. Restore CI coverage of supported inputs and explicit refusals, and translate the supported-load rerun notice into all supported languages. See [the results-change record](../docs/results-changes/2026-11-narrow-partial-loads.md) (#2223, #2222).
