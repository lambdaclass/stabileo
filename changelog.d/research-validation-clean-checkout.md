### Fixed

#### Run research evidence checks from a clean checkout (2026-11-27)

The research WASM corruption checks can run on CI runners that restore cached WASM assets before building any native crates.
