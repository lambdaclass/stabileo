# Southwell (1932): first version, 0 reviews

One production-engine benchmark, not a reproduction of Southwell's original experimental data. Effort: low (existing corotational and buckling wrappers); impact: a directly inspectable critical-load estimate with two plots. No reference code is adapted. No paper summary is claimed.

Citation: R. V. Southwell, “On the analysis of experimental observations in problems of elastic stability”, Proceedings of the Royal Society of London A 135(828), 601–616 (1932), DOI https://doi.org/10.1098/rspa.1932.0055. The catalogue checker's Crossref lookup verified title, author, year and venue on 2026-10-29. Volume and pages are bibliographic context supplied with the task.

## Example and reference

The engine-owned `engine/tests/benchmarks/southwell_1932.json` defines a horizontal pinned–roller column: L = 3 m, E = 200,000 MPa, A = 0.01 m², I = 10⁻⁶ m⁴, 20 frame elements, a stress-free sine centerline of amplitude a = 0.0003 m (L/10,000). Horizontal orientation is immaterial without gravity. The right end is free axially and restrained laterally; both end rotations are free.

Seven axial dead loads span 0.2–0.8 times Euler's π²EI/L² = 219.324542246 kN. Each is independently ramped from zero through 20 increments with the production corotational solver (80 Newton iterations maximum, residual tolerance 1e-8). δ is **additional** midpoint transverse displacement, not the initial offset plus displacement. The separate production linear buckling solve uses the perfect straight geometry and a unit compressive load.

The small-deflection imperfect-column reference is δ = aP/(Pcr − P). Rearranging gives δ/P = δ/Pcr + a/Pcr. Ordinary least squares with a free intercept estimates Pcr as the reciprocal slope. This fit is postprocessing, not a structural solver.

The native test requires Southwell within 1% of Euler and linear buckling within 0.1%, and checks convergence, monotone finite displacements, and recovery of the imperfection from the intercept within 2%. At the largest load the closed-form total lateral offset is 0.0015 m = L/2,000, so finite rotations remain small; axial strain is below 0.00009. The 1% target allows discretization of the curved centerline and finite-geometry/axial-shortening effects. It is a benchmark target, not a proven general error bound.

## Run

```
SOUTHWELL_EXPORT="$PWD/research/stability/southwell-1932/results/stabileo_results.json" nix develop -c bash -c 'cd engine && cargo test --test solver southwell_1932 -- --nocapture'
nix develop -c make typecheck.web
make test.web.unit
research/tools/check_isolation.sh
python3 -I research/tools/test_catalog.py
python3 -I research/tools/catalog.py export
python3 -I research/tools/catalog.py check --offline
```

The page `/research/stability/southwell-1932` runs on load through `solveCorotational2D` and `solveBuckling`, uses Stabileo's scalar-field viewer, and supports selected-load editor sharing. The engine-benchmark live-on-load exemption applies: there is no synthetic replay. The optional native export is published evidence only; the page does not substitute it for a live solve. The load–deflection chart includes the closed form; the Southwell chart includes the fitted line. Units are m/kN internally and mm/kN in the chart.

## Not yet

- Original experimental observations and published figures.
- Mesh/imperfection convergence sweeps and noisy experimental fitting.
- Postbuckling, material nonlinearity, or general boundary conditions.
- Independent review or engineering certification.

## Native result

The shared-case test passed on 2026-10-29. Euler: 219.324542246 kN; production linear buckling: 219.324727461 kN; Southwell estimate: 219.800127753 kN (0.216841% above Euler). The exported JSON contains all seven displacement fields. The gallery thumbnail is drawn from its final field, magnifying the lateral coordinate by 357 relative to the axial scale.

## Verification in this checkout

- Native shared-case test: passed.
- Production WASM/native parity: passed for both critical loads and all seven midpoint displacements (6 decimal places in kN, 10 in m).
- Experiment unit tests and the untranslated-markup gate: 9 tests passed.
- Full web unit suite executed: 1,301 files passed, 15 failed and 2 were skipped. The new page's literal-name issue was corrected; all 15 failed files then passed with one worker (144 tests), without relaxing tolerances. The original run also reported worker timeouts under concurrent build load; it was not a clean single-run pass.
- Catalogue tests, offline check/export, online Southwell citation check and research isolation: passed.
- Landing/app route-size gate against an untouched HEAD snapshot: passed. Landing 2,195,398 bytes unchanged; app 26,820,324 → 26,820,330 bytes (+6, within the existing 128-byte allowance). No budget was increased.
- Production web bundle: built successfully.
- The 360/390/810 px Playwright specs could not execute: Chromium launch was denied by the macOS sandbox (`MachPortRendezvousServer`, permission denied). The available browser-access host was also unavailable. Responsive layout and screenshots still require execution in a browser-enabled environment.
- Final `typecheck.web`: passed (247 existing TypeScript baseline errors, no new errors; Svelte guarded paths clean; shared-header check passed).
