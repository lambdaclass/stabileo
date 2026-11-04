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
thermal prestress supplies N=-1, so load factors equal the dimensionless forces f.
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

From the repository root inside `nix develop`:

```
CARGO_TARGET_DIR=/private/tmp/claude-501/codex-arches-target cargo test --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml
CARGO_TARGET_DIR=/private/tmp/claude-501/codex-arches-target cargo run --locked --manifest-path research/mechanics/biggins-2026/Cargo.toml --bin validate
```

`validate --write` regenerates evidence only after checks pass. `replay` prints the
same solver's default run; the tests compare every saved nodal height. `build.sh`
creates the separate research WASM with the production buckling dependency, retaining
only the research export. It is invoked by `make research.wasm` after the shared viewer.
Offline Research CI runs these checks; online catalogue verification is separate.

Open questions: inspect experimental snap traces from the large archive; assess offset
patterns and fully nonlinear paths when a suitable engine API exists. These are outside
this centered shallow-arch reproduction. The requested engine-benchmarks remote-tracking
branch was absent in this checkout; its implementation could not be read with git show.

The gallery thumbnail plots three equilibria from replay.json (steps 0, 47 and 60); it is not a paper figure or a browser screenshot. Chromium launch is unavailable in the agent sandbox; the maintainer should run web/e2e/research-arches.spec.ts and may regenerate the thumbnail through scripts/research-thumbs.mjs.
