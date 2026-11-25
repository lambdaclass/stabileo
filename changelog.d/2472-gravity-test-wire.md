### Fixed

#### Encode gravity reaction test inputs for strict WASM decoding

Gravity reaction tests use the shared solver input encoder so both linear and P-Delta checks receive omitted distributed load bounds as absent fields.
