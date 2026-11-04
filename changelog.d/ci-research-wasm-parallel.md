### Changed
#### Research WASM builds its bundles in parallel (2026-11-03)

The research WASM bundles that missed their cache build at the same time, each in its own
target directory, instead of one after another: about 6 minutes instead of 15 when the engine
changes. Every bundle's log is printed, and any failed bundle fails the job by name.
