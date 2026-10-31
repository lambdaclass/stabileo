# Navier plate — first version, 2 review rounds

Low effort / high impact: one existing plate problem, two production elements and the shared viewer. No new solver and no engine numerics changes.

Route: `/research/benchmarks/navier-plate`. The historical label “Navier (1823)” is retained as a benchmark attribution, not asserted as a verified original publication date. The catalogue checker verified the modern reference chapter, Ventsel and Krauthammer, *Rectangular Plates* (2001), DOI 10.1201/9780203908723-3. No source code was copied.

The worked example is [Terje Haukaas, Navier’s Solution for Uniform Load](https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf), updated 9 February 2018, pp. 1–3, explaining Timoshenko and Woinowsky-Krieger (1959), Article 28. Its printed centre displacement is 1.28375 mm. Our independently evaluated 100 × 100 odd-term series gives 1.2837481142296345 mm. The centre sine factors alternate; summing their absolute values would be wrong.

## One example

3 × 5 m, thickness 0.1 m, E = 63,000 MPa, ν = 0.2, pressure 10 kN/m² downward. All four edges have uz = 0 and free bending rotations (soft simple support). At (0,0), ux = uy = 0; at (3,0), uy = 0. The pressure is lumped as tributary nodal forces, cell by cell (qA/3 per triangle node, qA/4 per quadrilateral node), with no consistent rotational terms. Total load is 150 kN. DKT splits each rectangle along its ascending diagonal; MITC4 uses one quadrilateral. Each family uses 4×4, 8×8 and 16×16 subdivisions, with identical nodal counts at each level but twice as many DKT cells.

`engine/tests/benchmarks/navier_plate.json` contains the shared, explicit solver cases; the native test rebuilds every case from the plate definition and requires the fixture to equal it exactly. Rust tests deserialize them into production SolverInput3D; the browser converts those same inputs to Maps and calls `initSolver` / `solve3D` from the production WASM wrapper in a terminable worker. No alternate numerical solver is present. `results/stabileo_results.json` stores native production-engine outputs, tested against WASM. The replay steps are refinement cases, not physical time or load steps.

### Two references

- **Thin-plate (Kirchhoff) series**, 100 × 100 odd terms: 1.2837481142 mm. Truncation: changing to 400 × 400 terms moves it by 2.6e-11 mm.
- **Reissner–Mindlin series, hard simple support**, shear correction κ = 5/6, G = E/2(1 + ν), 1000 × 1000 odd terms: 1.288120842251 mm (+0.341% over thin plate). The shear term is 16q/(π⁴κGt) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)]. Truncation: 2000 × 2000 terms moves it by under 1e-9 mm.

Both series are evaluated independently in Rust (`navier_plate.rs`) and TypeScript (`model.ts`).

### What converges to what

DKT is a thin-plate element and converges to the Kirchhoff series at second order: successive increments shrink 3.96×, and Richardson extrapolation of 16×16 and 32×32 lands within 0.01% of the series.

MITC4 includes transverse shear. With only uz restrained at the edges (soft simple support) it solves a different problem with an edge boundary layer; the native test refines to 32×32 (1.305399 mm) and 64×64 (1.310611 mm) and the centre deflection keeps rising above both series, at first order. Neither series is its reference, so the 4×4 and 8×8 "closer to the thin-plate series" result is a sign crossover (−1.36% → +0.26%), not accuracy, and the page says so. No published soft-support reference is used.

With hard simple support (rrx = 0 on x = 0 and x = a, rry = 0 on y = 0 and y = b; the rotation along each edge is restrained) MITC4 converges at second order to the Reissner–Mindlin series:

| Grid | MITC4, hard support (mm) | Difference from Reissner–Mindlin (%) |
|---|---:|---:|
| 4×4 | 1.262988839 | -1.951 |
| 8×8 | 1.280900838 | -0.561 |
| 16×16 | 1.286287698 | -0.142 |
| 32×32 (native only) | 1.287661132 | -0.036 |

Increments shrink 3.33× and then 3.92×; Richardson extrapolation of 16×16 and 32×32 is within 0.0002% of the series. The 4×4 → 16×16 error reduction is 13.71×. These rows are precomputed natively (`hard_rows` in the replay) and the browser WASM engine is checked against them at every node in Vitest; the page does not recompute them live.

### Tolerances and what each covers

| Check | Bound | Basis |
|---|---|---|
| Published 1.28375 mm vs series | 5e-6 mm | the example prints five decimals |
| Kirchhoff / Mindlin truncation | 1e-9 mm | measured 2.6e-11 / 1.3e-9 at 100 terms, 2e-11 at 1000 |
| DKT 16×16 vs thin-plate series | 0.25% | measured 0.2202%, which is its discretisation error (Richardson) |
| MITC4 hard 16×16 vs Reissner–Mindlin | 0.16% | measured 0.1423% |
| DKT and MITC4 hard increment ratio | 3.5–4.5 | second order |
| Richardson extrapolation vs series | 0.01% | measured < 0.0002% |
| Every case, finest grid vs thin-plate series | 5% | the original acceptance bound, kept |
| Vertical equilibrium | 1e-6 kN | |
| WASM vs native replay, every node | 1e-9 mm | same engine, two builds |

The MITC4 soft-support rows are pinned only by replay parity and by the requirement that they keep rising above both series; if that changes, the page text must be revisited.

Regenerate the replay from repository root inside the pinned Nix shell:

```
NAVIER_RESULTS="$PWD/research/benchmarks/navier-plate/results/stabileo_results.json" nix develop -c cargo test -p dedaliano-engine --test validation navier_plate_shared_cases -- --nocapture
```

The shared research viewer bundle is built by the existing `make research.wasm` workflow. The main engine bundle is built by `make wasm`. Live calculation loads only on this research page. The viewer displays a flat displacement contour, not a deformed surface. The gallery image is generated from that computed contour with `python3 -I research/benchmarks/navier-plate/thumbnail.py`.

## Not yet

- MITC9 exists in Rust but is not exposed by the production web wrapper; no browser comparison is claimed. No reference exists here for MITC4 with soft simple support (a fine MITC9 sequence or published values would provide one).
- Other aspect ratios, thickness sweeps, distorted meshes, moment convergence and timing comparisons.
- Out-of-plane deformed surface rendering.
- Experimental validation or engineering certification.

The catalogue stage is `first-version`, with review rounds 1 (Codex, Kimi) and 2 (Kimi, Codex, Claude), both on 2026-10-30. Its conservative evidence status remains `proposed`; the stage is not a claim of numerical validation of the engine as a whole. Research, not a design tool.

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

DKT reduces its absolute thin-plate error by 15.78× from 4×4 to 16×16. MITC4 (soft support) is closer to the thin-plate series on 4×4 and 8×8 and DKT on 16×16, but MITC4 here is not converging to that series (see above), so this is not an accuracy ranking; its 1.26× "reduction" is likewise not meaningful.

## Verification (round 2, 2026-10-30)

Round 2 (Kimi, then Codex, then Claude) found no blocker; every should-fix item is addressed:

- MITC4's error is no longer attributed to transverse shear. The hard-support variant and the Reissner–Mindlin series above replace that claim; soft-support MITC4 is labelled as a different problem, not an accuracy ranking.
- One 5% gate is replaced by the separate bounds in the table above (the 5% bound is kept as well).
- The fixture is checked against an independent plate builder (Rust) and against physical invariants (Vitest: dimensions, E, ν, t, uz-only edge supports with free rotations, the three in-plane restraints, centre node, qA/3 and qA/4 per node, `published_mm` = 1.28375).
- WASM is compared with the native replay at every node, for the six soft-support and the three hard-support meshes. Winners, the 8×8 MITC4 minimum and the 15.78×, 1.26× and 13.71× ratios are asserted on the real replay rows.
- The page distinguishes replay, running, complete, partial (k of 6), cancelled and failed runs; the status line is a polite live region and the results are `aria-busy` while running. Worker errors are codes with translated messages.
- Six locales (en, es, pt, de, fr, tr) for the page, its metadata and the viewer, with locale number formatting (signed differences show "+"). Viewer pointer coordinates use `Intl`.
- Viewer: keyboard pan (arrows), zoom (+, −), fit (0) and orbit (Shift + left/right in 3D); its label states mesh, range and unit; the legend label states its range; the axis canvas is decorative.
- The app column comes first in the DOM (grid placement on desktop), so keyboard order follows the visual order below 1100 px. A short-landscape layout keeps the viewer above the fold at 844 × 390.
- "Show the finest MITC4 mesh" selects the finest live row when a complete live run exists.
- The results tables have captions.

Commands run on this branch: the native shared-case test (`cargo test --test validation navier_plate_shared_cases`), Vitest for `src/components/research`, `src/components/viewport` and `src/lib/i18n` (including the hard-coded-text check), `make typecheck.web` (247 baseline errors, none new), the research isolation and viewer checks, the offline catalogue check, and Playwright `e2e/research-navier.spec.ts`, `e2e/research.spec.ts` and `e2e/research-layout.spec.ts` (smoke).

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
web/src/components/research/shell/StabileoViewer.svelte
web/src/components/viewport/ScalarFieldViewer.svelte
web/src/components/viewport/ContourLegend.svelte
web/vite.research-viewer.config.ts
web/src/lib/i18n/locales/{en,es,pt,de,fr,tr}.ts
web/public/research-thumbs/navier-plate.svg
changelog.d/navier-plate.md
```
