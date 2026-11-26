### Added
#### Prepare an isolated GPU compute backend (2026-11-24)

Add a shared batched sparse-operator interface, the existing CPU kernel, and an experimental WebGPU/Metal implementation. GPU arithmetic is explicitly f32 and does not supply production solver results. Production algorithms, tolerances and guards are unchanged.

Add a hybrid PCG experiment that shares the CPU iteration loop, checks the original f64 residual, and reports CPU/GPU timings and displacement errors. GPU results remain isolated from production analysis.

Add an experimental resident-vector PCG variant for WebGPU/Metal, with guarded scaled reductions, per-solve transfer counters, and comparison against the existing hybrid solver.

Improve resident GPU memory access with contiguous vectors and bounded row interleaving, preserving accumulation order and falling back to CSR when padding or memory limits would be exceeded.

Reuse resident pipelines and GPU structure for validated value updates, remove intermediate readback copies, and benchmark update-plus-solve against fresh preparation. Upgrade wgpu to remove the unmaintained Metal dependency and scope the hexf-parse licence allowance to its exact version.
