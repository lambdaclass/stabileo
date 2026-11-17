### Fixed
#### BREAKING (results): Share embedded load geometry across automatic member cuts (2026-11-17)

Restore analysis subdivision and variable-member expansion of planar members with saved offsets. Manual cuts, automatic cuts and recovery now share the solver's offset-free load geometry; true 3D models retain flexible offsets. Correct partial-load resultants previously measured on the wrong length. Merge main's concentrated-live and weld fixes while retaining both integration test modules, resolving the trusted CI merge conflict. See [the results-change record](../docs/results-changes/2026-11-generated-member-cuts.md) (#2223, #2222).
