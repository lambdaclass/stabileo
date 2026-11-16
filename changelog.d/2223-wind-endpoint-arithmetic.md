### Fixed
#### BREAKING (results): Retain supported wind member intervals at rounded endpoints (2026-11-16)

Restore native and WASM solves when a wind load endpoint matches the member endpoint through alternate length arithmetic or an exact coordinate round trip. Shared geometry mapping transforms load coordinates and densities together before strict interval validation, assembly and recovery. Distinct overhangs and sub-limit intervals still refuse. Strengthen fiber prescribed-force and distributed-couple regression assertions. See [the results-change record](../docs/results-changes/2026-11-wind-endpoint-arithmetic.md) (#2223, #2222).
