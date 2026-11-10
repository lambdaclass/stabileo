### Fixed

#### Result checks reject seeded wrong solver outputs (#1919)

Add lightweight seeded-failure self-tests for the shared nightly metamorphic relations, cross-method differential checks and certificate oracles. Every seeded check has a passing control and must report a numerical failure for deliberately wrong solver output. Exercise the nightly collector through its real replay executable and verify its exit status and finding artifact.

Reject empty linear-agreement comparisons and differential fields, zero-work responses to nonzero energy probes, missing nightly failure records and false generalized relative certificate bounds. Fault injection is confined to integration tests; production numerics, engine results, tolerances and baselines are unchanged.
