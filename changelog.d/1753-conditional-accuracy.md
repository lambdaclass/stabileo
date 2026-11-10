### Changed

#### BREAKING (results): condition loaded linear responses above the product fast accept (2026-11-10)

Keep the product precision fast accept and conditionally admit matrices within the separate condition-number and node-anisotropy limits. Compensated refinement and recovered member-force equilibrium must pass the shared accuracy limit on each load case. Restore all four main shell benchmarks with their original assertions; retain thin-strip and Winkler/SSI references. Loaded C08 copies must match independent 90-digit physical references and one another; uncertain copies may refuse. Newly admitted models remain Refs and the original #993 reproducer remains ignored. Retain the two SA-2026-054 containments and raw-diagonal warnings. No benchmark tolerance or historical baseline changes.
