### Fixed

#### Omit unset support fields from assembled solver inputs

Planar and spatial model assembly omit unset support properties so their wire objects reach the structural checks in direct WASM calls.
