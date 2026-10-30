# Navier plate — first version, 0 reviews

Low effort / high impact: one existing plate problem, two production elements and the shared viewer. No new solver and no engine numerics changes.

Route: `/research/benchmarks/navier-plate`. The historical label “Navier (1823)” is retained as a benchmark attribution, not asserted as a verified original publication date. The catalogue checker verified the modern reference chapter, Ventsel and Krauthammer, *Rectangular Plates* (2001), DOI 10.1201/9780203908723-3. No source code was copied.

The worked example is [Terje Haukaas, Navier’s Solution for Uniform Load](https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf), updated 9 February 2018, pp. 1–3, explaining Timoshenko and Woinowsky-Krieger (1959), Article 28. Its printed centre displacement is 1.28375 mm. Our independently evaluated 100 × 100 odd-term series gives 1.2837481142296345 mm. The centre sine factors alternate; summing their absolute values would be wrong.

## One example

3 × 5 m, thickness 0.1 m, E = 63,000 MPa, ν = 0.2, pressure 10 kN/m² downward. All four edges have uz = 0 and free bending rotations. At (0,0), ux = uy = 0; at (3,0), uy = 0. Uniform nodal loading is assembled cell by cell (qA/3 for triangles, qA/4 for rectangles). Total load is 150 kN. DKT splits each rectangle along its ascending diagonal; MITC4 uses one quadrilateral. Each family uses 4×4, 8×8 and 16×16 subdivisions, with identical nodal counts at each level but twice as many DKT cells.

`engine/tests/benchmarks/navier_plate.json` contains the shared, explicit solver cases. Rust tests deserialize them into production SolverInput3D; the browser converts those same inputs to Maps and calls `initSolver` / `solve3D` from the production WASM wrapper in a terminable worker. No alternate numerical solver is present. `results/stabileo_results.json` stores native production-engine outputs, tested against WASM. The replay steps are refinement cases, not physical time or load steps.

The native test checks monotonic Kirchhoff centre-error reduction for DKT, shrinking successive displacement increments for both families (the final increment must be smaller than the preceding increment; no convergence order is assumed), finest-grid relative error below 5%, and vertical equilibrium within 1e-6 kN. These are new benchmark acceptance criteria; no existing tolerances are changed. The Fourier truncation is checked independently at 100 and 200 odd terms per direction. MITC4 includes shear deformation and does not converge monotonically to the thin-plate reference: its error turns after 8×8. This is displayed, not hidden by changing the reference or tolerance. The sign convention shown is positive downward, in mm.

Regenerate the replay from repository root inside the pinned Nix shell:

```
NAVIER_RESULTS="$PWD/research/benchmarks/navier-plate/results/stabileo_results.json" nix develop -c cargo test -p dedaliano-engine --test validation navier_plate_shared_cases -- --nocapture
```

The shared research viewer bundle is built by the existing `make research.wasm` workflow. The main engine bundle is built by `make wasm`. Live calculation loads only on this research page. The viewer displays a flat displacement contour, not a deformed surface. The gallery image is generated from that computed contour with `python3 -I research/benchmarks/navier-plate/thumbnail.py`.

## Not yet

- MITC9 exists in Rust but is not exposed by the production web wrapper; no browser comparison is claimed.
- Other aspect ratios, thickness sweeps, distorted meshes, moment convergence and timing comparisons.
- Out-of-plane deformed surface rendering.
- Independent reviews, experimental validation or engineering certification.

The catalogue stage is `first-version`, with no reviews. Its conservative evidence status remains `proposed`; the stage is not a claim of numerical validation of the engine as a whole. Research, not a design tool.

## Measured centre displacements

Reference: 1.283748114 mm (published: 1.28375 mm).

| Element | Grid | Stabileo (mm) | Signed difference (%) |
|---|---|---:|---:|
| DKT | 4×4 | 1.239130910 | -3.475542 |
| DKT | 8×8 | 1.272493217 | -0.876722 |
| DKT | 16×16 | 1.280921494 | -0.220185 |
| MITC4 | 4×4 | 1.266318869 | -1.357684 |
| MITC4 | 8×8 | 1.287043561 | +0.256705 |
| MITC4 | 16×16 | 1.297573175 | +1.076929 |

DKT reduces its absolute reference error by about 15.8× from 4×4 to 16×16; MITC4 by about 1.26×. MITC4 is closer on 4×4 and 8×8, but DKT is closer on 16×16. This comparison is specific to these meshes, this thickness and this thin-plate reference.

## Verification of this first version

- Native shared-case test: passed, all six meshes; unchanged 5% finest-grid accuracy and 1e-6 kN equilibrium criteria.
- New Vitest tests: 9 passed, including production WASM/native replay parity, shared-input fidelity, series truncation and locale keys.
- Research isolation, shared-viewer rule, engine test-target registration, catalogue tests and offline catalogue check: passed. The new catalogue entry also passed an online Crossref check.
- `make typecheck.web` in the pinned Nix shell: passed (247 existing TypeScript baseline errors, no new errors; Svelte guarded paths and site header passed).
- Full web unit suite: 1,286 files / 15,857 tests passed, 10 failures in 7 files, 14 skipped tests. The new page's hardcoded citation labels were corrected. All previously failing files plus the new Navier tests then passed serially: 8 files / 58 tests. No timeouts, existing tolerances or engine numerics were changed. This is not a claim that the entire suite was rerun serially.
- Production Vite bundle: built successfully. Playwright/prerender could not launch Chromium in this local sandbox (`MachPortRendezvousServer`, permission denied). The e2e spec covers live results, replay restart, the shared viewer and overflow at 360, 390 and 810 px, but these browser assertions remain unverified here.
- The requested read-only `origin/research/engine-benchmarks-macneal-harder` reference was absent locally; no fetch or Git write was performed.

## Files

```
engine/tests/benchmarks/navier_plate.json
engine/tests/benchmarks/navier_plate.rs
engine/tests/validation/main.rs
research/README.md
research/papers.yaml
research/papers.json
research/benchmarks/navier-plate/README.md
research/benchmarks/navier-plate/results/stabileo_results.json
research/benchmarks/navier-plate/thumbnail.py
web/src/components/research/navier1823/NavierPage.svelte
web/src/components/research/navier1823/model.ts
web/src/components/research/navier1823/solve.worker.ts
web/src/components/research/navier1823/strings.ts
web/src/components/research/navier1823/__tests__/model.test.ts
web/src/components/research/Gallery.svelte
web/src/components/research/ResearchPage.svelte
web/src/components/research/experiments.ts
web/scripts/prerender.ts
web/e2e/research-navier.spec.ts
web/public/research-thumbs/navier-plate.svg
changelog.d/navier-plate.md
```
