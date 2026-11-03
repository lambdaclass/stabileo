### Changed
#### Research WASM rebuilds only the bundles whose inputs changed (2026-11-03)

Each of the six research WASM bundles has its own build cache, keyed on its crate, the engine
(every bundle links it), the shared toolchain and research tooling. A change to one research
crate rebuilds only that bundle instead of all six.
