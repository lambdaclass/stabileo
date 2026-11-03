### Changed
#### Research WASM rebuilds only the bundles whose inputs changed (2026-11-03)

Each of the six research WASM bundles has its own build cache, keyed on its crate, the shared
toolchain and research tooling, and the engine only for the bundles that link it (Shauer,
Biggins, Fairclough). An engine change no longer rebuilds Grossman, Andreassen and Pastrana,
about 7 of Research WASM's 15 minutes on the self-hosted runners.
