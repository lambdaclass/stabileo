### Fixed

#### Omit unset support fields when encoding solver inputs

Planar and spatial inputs preserve their assembled support records. The object and JSON dispatch adapters omit unset properties before the input reaches the strict WASM decoder.
