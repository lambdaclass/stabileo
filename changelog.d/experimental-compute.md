### Added
#### Prepare an isolated GPU compute backend (2026-11-24)

Add a shared batched sparse-operator interface, the existing CPU kernel, and an experimental WebGPU/Metal implementation. GPU arithmetic is explicitly f32 and does not supply production solver results. Production algorithms, tolerances and guards are unchanged.

Add a hybrid PCG experiment that shares the CPU iteration loop, checks the original f64 residual, and reports CPU/GPU timings and displacement errors. GPU results remain isolated from production analysis.
