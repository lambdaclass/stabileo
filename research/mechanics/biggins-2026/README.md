# Centered curvature patterns on a shallow arch

Zmyślony, Khan & Biggins, *Snapping and switching of elastic arches with patterned
preferred curvature*, Physical Review Research **8**, 033168 (2026),
[10.1103/56f8-8gsx](https://doi.org/10.1103/56f8-8gsx).
Crossref metadata verified with `research/tools/catalog.py show 10.1103/56f8-8gsx`.

Low implementation cost / high visual impact: production frame buckling, the shared
viewer, and a small modal equilibrium calculation. Scope is the centered rectangular
pattern, width 0.30–0.90 and shortening 0.002–0.020. Offset patterns, optimizations,
active material calibration, passive boundary-driven paths, and dynamics are excluded.

## Equations and production boundary

The engine is an unchanged library dependency. `solve_buckling_2d` supplies 16 Euler
modes of a flat-clamped beam with 64 frame elements. Unit length and EI=1; a uniform
thermal prestress supplies compressive N=1, so load factors equal the dimensionless forces f.
MPa-to-kN conversion is accounted for in E=1000 MPa, A=0.1 and I=1e-6.

Mode slopes are normalized to half their squared integral = 1 using exact cubic
Hermite integration. The rectangular curvature projection is half the difference
of the mode slopes at the segment ends. Reflection symmetry removes odd-mode
coupling. The sum of squared modal responses is the compression spectrum of Eq.(3).
The first minimum between f0 and f1 (including f1) sets the snap threshold.

Sources: [arXiv v2](https://arxiv.org/html/2601.06598v2), Eq.(2) p.3, Eq.(3) p.4;
supplementary S2.6 and S2.8. The central 70% threshold is 21.52 sqrt(epsilon),
p.3 after Eq.(2), also Table S1 on supplementary p.8 (combined PDF p.17).
Pages refer to the arXiv v2 PDF, not publisher pagination.

The frame eigenproblem is production Stabileo. The inextensible shallow-angle
constraint and branch selection are research code. Production arc-length explicitly
refuses thermal loading and prescribed displacements; no engine changes were made.
The replay connects quasistatic equilibria across an instantaneous jump; it is not
a simulation of snap timing, damping, inertia or the actual transient shape.
The displayed antisymmetric mode is the production eigenvector, not a transient.

## Reference provenance

Zenodo record **18256271**, CC-BY-4.0, supplies software and experimental data.
Its single 25,513,868,345-byte ZIP was inspected using HTTP byte ranges and its ZIP64
central directory. Only small selected members were extracted in scratch storage;
no downloaded code was placed in product paths. The authors' two shallow-angle
modules were inspected and imported in an isolated venv, unmodified. The exact
source hashes, package versions and generation expression are in
`reference-results/SOURCE.json`; `generate_reference.py` is the reproduction driver.

`thresholds.csv` and `thresholds.json` are **regenerated reference software outputs**,
not digitized figures or measured thresholds. The separate unchanged
`curvature_temperature.csv` is the archive's small experimental calibration dataset;
it is retained with attribution and hashes but is not a threshold validation target.
The large movies/HDF5 data were not downloaded or compared. See LICENSE-data.md.

The reference optimizer's default tolerance and rectangular-profile quadrature can
produce small irregularities. The 0.3% comparison tolerance covers the observed
0.1821% maximum discrepancy without altering the authors' code. A separate mesh/modal
refinement check bounds sensitivity of our results. Published agreement is claimed
only for the one 70% threshold, not an entire published figure or laboratory dataset.

## Reproduce

From the repository root:

```sh
make test.research.biggins
make evidence.research.biggins
make wasm.research.biggins
```

`validate --write` regenerates `VALIDATION.json` and
`reference-results/published_comparison.json` only after checks pass. The latter
records the published 70% threshold comparison and is read by the web evidence test.
`replay` prints the same solver's default run, saved by the evidence target in
`reference-results/replay.json`; the tests compare every saved nodal height. `build.sh`
creates the separate research WASM with the production buckling dependency, retaining
only the research export. It is invoked by `make research.wasm` after the shared viewer.
Offline Research CI runs these checks; online catalogue verification is separate.

## Open questions

Inspect experimental snap traces from the large archive; assess offset patterns and
fully nonlinear paths when a suitable engine API exists. These are outside this
centered shallow-arch reproduction.

## Review round 2 — 2026-10-30

Reviewers: Kimi, Codex, Claude. All confirmed should-fix items are covered by the
critical-pair, invariant, evidence, display-state, localization and responsive tests.
The live page compares the single published 70% threshold and 31 regenerated Zenodo
software outputs; no experimental or full-figure comparison is claimed. There is no
Biggins entry in the roadmap's “Open items shown on live research pages” table and no
unanswered-question section on the page.

The replay has 62 states: steps 48 and 49 are the upward and downward equilibria at
exactly the same critical α. Each state includes nodal slopes for independent
three-point Gauss integration of ½∫w′² = ε. Tests also check clamped slopes and heights,
the spectral constraint residual, analytical initial height, critical force, and all
four parameter-domain corners. The engine benchmark checks all 31 thresholds against
the same published replay; production numerics are unchanged.

## Tolerance budget

- Published threshold: absolute tolerance **0.005**, half the last printed digit of
  21.52. No additional discretization allowance is added; the observed error is
  0.0026961 and fits within the rounding budget.
- Zenodo software: relative tolerance **0.003**. The default optimizer and rectangular
  quadrature have a measured maximum discrepancy of 0.0018207; the independent
  mesh/mode sensitivity is below 0.0004000. Their sum is below 0.003. This is a
  reference-software regression budget, not an experimental uncertainty estimate.
- Mesh/mode refinement: relative tolerance **0.001**, one third of the software
  comparison budget, limiting discretization to 0.1%; the measured maximum over all
  31 widths is 0.00039996 for 64/16 versus 96/24 elements/modes.
- Euler loads: relative tolerance **1e-5**, a separate analytical accuracy target
  100 times tighter than the refinement budget. The 64-element errors are
  1.29e-7 and 5.40e-7; analytic references are 4π² and 80.7629142257.
- The authors’ software gives 21.5141 at 70%, outside the rounding interval of the
  published 21.52. The overlay is explicitly labeled as software output and the
  page explains its optimizer/quadrature irregularities.

The gallery thumbnail is generated from our replay, not a paper figure.
Responsive Playwright coverage (`web/e2e/research-arches.spec.ts`, all `@smoke`) spans 360,
390, 844×390 and 810 pixels in six locales: no horizontal overflow, 44 px targets, 12 px
text, the viewer's position, the chart readout at the right edge, the data table, and
mode view followed by the jump link. Two more cases check that Stop and a failed worker
keep the computed parameters.

Verification on 2026-10-30: 243 Vitest tests across 44 research, i18n and e2e-policy files
passed; 4 native research tests, both complete evidence-file comparisons, the engine arch
benchmark and research WASM replay parity passed; typecheck reports the 247 baseline
errors and no new ones; offline catalogue validation reports 48 papers and zero problems;
the research isolation check passes; all 28 Playwright smoke cases of the arches spec pass.
