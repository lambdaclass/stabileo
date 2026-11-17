### Fixed
#### BREAKING (results): Canonicalize coincident load endpoints before member splitting (2026-11-17)

- Member splitting, analysis subdivision, variable-member expansion, nonlinear refinement, influence section cuts and plastic hinge insertion now accept the same geometrically coincident distributed-load endpoints as the web adapter. Coordinates and all endpoint intensity pairs pass through the existing native certificate and force/moment preservation check before clipping. Distinct overhangs and unsupported intervals still refuse (#2222, #2223). See [endpoint arithmetic](../docs/results-changes/2026-11-wind-endpoint-arithmetic.md).
- Registered the member-load endpoint utility in the WASM invariance inventory, fixing Lint Engine and the corresponding script test.
