# Andreassen et al. (2011): minimum-compliance topology optimization

DOI: 10.1007/s00158-010-0594-7. Research, not a design tool.

Effort/impact: small implementation using the engine's existing sparse Cholesky and shared scalar viewer; high visual impact and an executable numerical reference. This isolated crate exposes configuration, mesh connectivity, element stiffness and a stepwise optimizer suitable for later product review. Engine code is read-only.

Summary source: the abstract on the [authors' DTU page](https://www.topopt.mek.dtu.dk/apps-and-software/efficient-topology-optimization-in-matlab). The paper presents an educational successor to the 99-line code, adding density filtering and improving efficiency with preallocation and vectorization. Our experiment covers the main SIMP/OC method, not the PDE or projection extensions or MATLAB performance claims.

The regular unit-square Q4 plane-stress mesh, node/element ordering, stiffness, filtering, OC move and bisection follow the published method. Defaults and exact source locations are in [reference/README.md](reference/README.md). Both filters are supported. Browser/native limits: 120×60 dimensions, at most 3600 elements, radius <=10, 1000 iterations; hitting the iteration cap is an error, never convergence.

Validation: `cargo test --release --locked` includes an independent constant-strain/rigid-mode patch test, stiffness symmetry, filter partition of unity and adjoint identity, OC move/bounds/volume checks, and full-precision reference comparisons. `UPDATE_VALIDATION=1 cargo test --release --locked --test reference -- --nocapture` regenerates evidence only after comparisons pass. Relative compliance tolerance 1e-6 accommodates different sparse factorization order; final physical density max absolute tolerance 1e-5. Volume error tolerance 5e-4 reflects the reference's finite OC bracket tolerance, not an exact equality constraint.

Published web data allowlist: `VALIDATION.json`, `reference-results/ft1.json`, `reference-results/ft2.json`, `reference-results/MANIFEST.json`. Separate browser assets are built by `wasm/build.sh`: WASM, glue, reference curves and compressed `.srpl` replay produced by this same Rust optimizer. Replay density quantization is display-only; comparisons use f64. No production app imports this crate.

Numerical agreement with authors' code is not experimental validation or engineering certification. No paper-figure comparison is claimed. See the reference README for licence limitations and the timing of reported compliance.

## Recorded comparison (GNU Octave 11.1.0)

| Filter | Iterations | Last reported compliance | Final physical volume | Maximum relative compliance difference | Final density max absolute difference |
|---|---:|---:|---:|---:|---:|
| Sensitivity (ft=1) | 106 | 216.813662961875 | 0.4998668996252272 | 1.30e-11 | 3.04e-11 |
| Density (ft=2) | 144 | 233.71457280741006 | 0.5000038591141052 | 1.63e-11 | 5.13e-11 |

The largest volume-constraint deviations across all iterations are 2.2785e-4 and 2.4434e-4 respectively (tolerance 5e-4). Final design changes are 0.00978309 and 0.00988840. `VALIDATION.json` is generated from the test measurements, not these rounded presentation values.

`wasm/build.sh` creates a content-addressed bundle and both replay files, verifies the WASM histories in Node, and publishes a small `build.json` pointer. Run `make research.wasm` to also build the shared viewer. The gallery SVG is generated from the final density bytes of our ft=1 replay; no paper image is used. The sequential grayscale viewer ramp maps density 1 to black and 0 to white.

Maintainer check: `web/e2e/research-topopt.spec.ts` covers replay, reference overlay, the live density-filter result and invalid-mesh rejection. Chromium was intentionally not launched during implementation. Full web prerendering also launches Chromium, so only the Vite compilation can be checked in this environment. Upstream redistribution rights remain unresolved; authors' source stays outside the repository.
