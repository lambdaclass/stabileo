# Experimental compute

This crate is not imported by the production engine or web app. It evaluates
symmetric sparse matrix/vector batches, not complete structural solves.
The CPU implementation calls the engine's existing f64 kernel. WebGPU and Metal
share one WGSL kernel through wgpu; their f32 outputs are experimental and are
not a substitute for CPU results, convergence decisions or safety checks.

The contracts live in `engine::linalg::backend`, so the engine can accept an
injected backend without depending on this crate. `SparseBackend` prepares an owned matrix; `PreparedOperator` reuses its buffers
for column-major batches. A future CUDA adapter can implement these Rust traits
without copying the solver. No CUDA implementation is included. Factorization,
iterative algorithms and automatic backend selection are subsequent work.

- `make test.compute`: CPU bit parity, malformed-input and conversion guards, WGSL validation.
- `make check.compute.webgpu`: compile the browser target.
- `make test.compute.webgpu`: build the separate WASM bundle and run Chromium/WebGPU
  against CPU references; requires web dependencies and Playwright Chromium.
- `make test.compute.metal`: execute the same shader on an available Metal GPU.
- `make lint.compute`: check the crate with both optional backends enabled.

Use `NIX_RUN=` with installed native toolchains. Hardware tests fail when no
adapter is available; they never silently pass. Browser bindings expose
`ExperimentalSparseOperator.create`, `apply_batch`, `reference_batch` and `free`.
Batches are limited by device capabilities and a 256 MiB GPU buffer budget per
operator. Explicit backend shutdown invalidates its operators. Out-of-range
f32 inputs and conservative overflow bounds refuse dispatch; subnormal outputs
and rounding remain platform-dependent. These checks do not certify a solve.
