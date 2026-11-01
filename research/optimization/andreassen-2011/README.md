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

## Round 2 review — 2026-10-30

Reviewed in sequence by Kimi, Codex and Claude; Claude's consolidated verified list had no solver blockers. Production engine numerics remain unchanged. The research-only boundary assembly is extracted without changing its operations so a test pins every restrained DOF and the downward unit load at the upper-left corner.

The live page compares the default half-MBB runs with the authors' **unmodified `top88.m` executed in GNU Octave**, not digitized publication images. This resolves the roadmap's live-page comparison item by naming the actual numerical reference. The manuscript's Figure 3(a) supplies parameters, not tabulated compliance. All 15 evidence rows (12 reference checks and 3 independent checks) now show measured errors, original tolerances and translated rationales. Compliance tolerance accounts for sparse factorization order; volume and change tolerances cover propagation through OC updates and stopping, and final density covers accumulated optimization sensitivity. Independent element/filter tolerances cover roundoff. No tolerance was increased.

`wasm/check.mjs` now compares every compliance, volume and design-change value, final density and convergence length against full-precision author/native data. Both packaged replays are decoded and checked against a fresh native run for configuration, iteration/frame order, column-major cell order and **each density's error ≤ 0.5/255**. Replay scalar histories retain full precision. `node --test wasm/check.test.mjs` additionally rejects corrupt scalar fields and replay lengths.

Run waits for initial assets; stopped and failed runs cannot masquerade as completed cached results. Worker errors are translated. The page includes six locales, localised metadata, a chart data table, a model description and quantization disclosure. Shared chart tooltips only report values from the displayed iteration. The viewer takes a local locale without persisting it, supports arrow-key pan and +/- zoom, restores menu focus on Escape/selection, and has 44px targets and 12px minimum control text. The page uses a compact introduction and ordinary page scrolling so controls remain reachable in short windows.

Unit tests render every evidence number and reason in each locale. Browser regression cases cover delayed references, stopped/failed workers, 360/390/844×390/810 and 1280×600 layouts, target/text sizes, keyboard controls, table access and locale persistence. Playwright cannot run in this environment; these assertions require execution on a browser-capable runner.

## Open questions

- What redistribution licence can be granted for the upstream `top88.m` source? It remains reference-only and is not shipped.
- Extensions beyond the implemented half-MBB case (alternative loads/supports, passive elements, multiple loads and projection/PDE filters) remain outside this experiment's stated scope.

There was no “Questions for the authors” section on this page. These research questions belong here, not in the live interface.

Review validation: 196 web unit tests passed (research components, hard-coded-text gate and viewer locale isolation); TypeScript gate: 247 existing errors, zero new errors. Seven Rust tests passed (six optimizer tests and the WASM wrapper allocation-limit test) under `CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-andreassen-2011-target CARGO_BUILD_JOBS=4`. The reference regeneration reproduced `VALIDATION.json` unchanged. Three Node checker tests and the complete two-filter WASM/native/reference/replay comparison passed. Shared viewer build and offline catalogue validation passed. The Playwright spec typechecks; browser cases were added but not executed, as required by this environment. The additional full Svelte check reports no errors in changed files, with 343 errors elsewhere in the repository.

## Follow-ups

- Add CI regeneration/diff enforcement for `VALIDATION.json`. Iteration-count error is now measured rather than hard-coded, but regeneration is still an explicit maintainer operation.
