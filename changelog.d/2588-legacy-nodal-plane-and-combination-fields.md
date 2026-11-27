### Fixed

#### Require a drawing plane for ambiguous legacy nodal loads

Basic asks for a drawing plane when an older planar model's nodal loads cannot establish a single compatible plane. Native and WASM multi-case analysis reject unknown combination definition fields, including a request for SRSS on the signed linear interface. See the [drawing plane results change](../docs/results-changes/2026-11-legacy-planar-project-plane.md) and the [structural input results change](../docs/results-changes/2026-11-malformed-structural-input.md). (#2588)
