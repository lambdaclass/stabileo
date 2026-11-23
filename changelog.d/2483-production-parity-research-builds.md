### Fixed
#### Research WASM has a separate build stage in production parity (2026-11-23)

Production parity builds research WASM and its viewer before assembling each site. Both sides can use one artifact when their research build inputs match. Each side verifies the artifact against its own snapshot and compares every shipped file.
