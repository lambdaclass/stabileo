### Fixed

#### Encode split-load test inputs for strict WASM decoding

The split-load density and endpoint tests use the shared object encoder before passing assembled inputs to WASM, so omitted bounds reach the solver as absent fields.
