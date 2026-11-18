### Fixed

#### Distributed-load bounds and fiber equilibrium (#2223)

- Reject distributed loads extending beyond either member endpoint, including near-full intervals, through a shared 2D/3D validator (#2222, #2223).
- Continue fiber Newton iteration until the existing final equilibrium checks pass, avoiding premature stops followed by an equilibrium refusal (#2223).

Results change: [bounds validation and fiber equilibrium](../docs/results-changes/2026-11-narrow-partial-loads.md).
