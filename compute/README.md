# Experimental compute

This crate is not imported by the production engine or web app. It evaluates
symmetric sparse matrix/vector batches and an experimental hybrid PCG solve of
`K·u = f`. Assembly, recovery and full structural acceptance are not GPU-enabled.
The CPU implementation calls the engine's existing f64 kernel. WebGPU and Metal
share one WGSL kernel through wgpu; their f32 outputs are experimental and are
not a substitute for CPU results, convergence decisions or safety checks.

The contracts live in `engine::linalg::backend`, so the engine can accept an
injected backend without depending on this crate. `SparseBackend` prepares an owned matrix; `PreparedOperator` reuses its buffers
for column-major batches. A future CUDA adapter can implement these Rust traits
without copying the solver. No CUDA implementation is included. PCG shares the engine's iteration loop:
GPU supplies matrix/vector products while preconditioning, reductions and
vector updates remain f64 on CPU. Automatic selection and GPU factorization
are subsequent work.

- `make test.compute`: CPU bit parity, malformed-input and conversion guards, WGSL validation.
- `make check.compute.webgpu`: compile the browser target.
- `make test.compute.webgpu`: build the separate WASM bundle and run Chromium/WebGPU
  against CPU references; requires web dependencies and Playwright Chromium.
- `make test.compute.metal`: execute the same shader on an available Metal GPU.
- `make bench.compute.metal`: release comparison against CPU PCG and sparse Cholesky.
- `make bench.compute.webgpu`: the same matrices in Chromium, recording its adapter.
- `make bench.compute.pcg`: compare CPU core cost with the original PCG implementation.
- `make lint.compute`: check the crate with both optional backends enabled.

Use `NIX_RUN=` with installed native toolchains. Hardware tests fail when no
adapter is available; they never silently pass. Browser bindings expose
`ExperimentalSparseOperator.create`, `apply_batch`, `reference_batch` and `free`.
Batches are limited by device capabilities and a 256 MiB GPU buffer budget per
operator. Explicit backend shutdown invalidates its operators. Out-of-range
f32 inputs and conservative overflow bounds refuse dispatch; subnormal outputs
and rounding remain platform-dependent. These checks do not certify a solve.

Solver comparisons use one warmup and six rounds covering every ordering of
CPU, hybrid GPU and resident GPU, with a median for each. Device startup and preparation are separate;
solve time includes transfers and validation against the original f64 matrix.
`COMPUTE_BENCH_OUT=/path/report.json` selects the output. All methods use the
same RHS; PCG uses the same Jacobi preconditioner, tolerance and iteration cap.
The CPU baseline calls production PCG with the same final-residual validation,
without the experimental CPU adapter's extra per-product validation.
The fixtures include grids and assembled 2D frame stiffnesses with manufactured
displacements. Reports keep nonconvergence, errors, true residual and solution
error; they do not silently substitute a CPU solution for a GPU failure.

For scaling, run `make bench.compute.metal COMPUTE_BENCH_PROFILE=large`. This
uses grids with 65,536–1,048,576 DOFs and clamped MITC4 plate meshes with roughly
24,000, 97,000 and 390,000 DOFs, assembled by the engine. Loads are manufactured from known
displacements. Cases are built one at a time; Cholesky is omitted above 4,096
DOFs to avoid unbounded factor fill. CPU/GPU residuals, errors against the known
solution and every timed repetition are retained at the same PCG tolerance.
The WebGPU benchmark accepts the same profile and uses full Chromium instead of
its headless shell (`COMPUTE_BROWSER_CHANNEL` overrides this). Inspect the recorded adapter
before interpreting timings, since a software adapter does not measure GPU speed.

The GPU experiment does not promise bit-identical results or certify matrix
stability. Its recursive convergence must also pass a fresh f64 residual test.
The synchronous production PCG keeps its previous arithmetic and guards; its
comparison oracle lives only in tests and the CPU cost experiment.

The resident variant keeps x/r/z/p/Ap and Jacobi data on GPU. Each iteration
reads two sets of workgroup summaries instead of a full vector and uploads only
scalar parameters; the RHS and final solution move once per solve. Reports count
these payload bytes and readbacks, excluding matrix preparation and driver internals.
Vector updates and partial reductions are f32, so results may differ from the
hybrid variant. Host control retains curvature, preconditioner, iteration and
stagnation checks; conservative range bounds precede GPU operations. The original
f64 residual still determines acceptance. One resident control interface serves
backends; WebGPU and Metal use the same WGSL kernels. Production CPU code is unchanged.
Resident vectors are contiguous, and sparse rows are interleaved in groups of 32
when padding stays within 25% and existing memory limits. Each row retains its
original summation order; other matrices keep CSR and padding is never evaluated.
