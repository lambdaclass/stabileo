### Added
#### Prepare an isolated GPU compute backend (2026-11-24)

Add a shared batched sparse-operator interface, the existing CPU kernel, and an experimental WebGPU/Metal implementation. GPU arithmetic is explicitly f32 and does not supply production solver results. Production algorithms, tolerances and guards are unchanged.
