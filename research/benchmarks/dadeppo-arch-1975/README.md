# DaDeppo–Schmidt (1975): deep circular arch

**First version · 2 review rounds (round 1: Codex, Kimi; round 2: Kimi, Codex, Claude; 2026-10-30). Research, not a design tool.**

One example: a 215° circular arch, clamped left and pinned right, with a downward dead point load at its crown. Forty straight production corotational frame elements and the production Crisfield arc-length solver trace the first limit point. No new solver or engine numerics are introduced.

## Reference and units

DaDeppo, D. A. and Schmidt, R. (1975), “Instability of Clamped-Hinged Circular Arches Subjected to a Point Load”, Journal of Applied Mechanics 42(4), 894–896. DOI: https://doi.org/10.1115/1.3423734. Metadata obtained with `research/tools/catalog.py show` and verified with its Crossref checker.

Robert Schmidt's 2000 discussion, Journal of Engineering Mechanics 126(12), p. 1308, quotes Table 1 of the 1975 paper for the limit point: **PR²/EI = 8.97**, crown **u/R = 0.6116**, **v/R = 1.1372** and rotation **0.0498**. Source: https://userweb.eng.gla.ac.uk/sondipon.adhikari/fulltext/journal/ft7a.pdf (second PDF page). All four values are compared. The comparison is with this quotation by the paper's coauthor; the 1975 table itself was not available to us. No reference code or copyrighted figures are copied.

Signs: u is positive toward the pinned end (engine +x), v downward (engine −uz). The rotation is compared with the engine's crown rotation `ry`, which is positive at the limit point; see "Open questions".

The frequently reported **P = 897** uses **R = 100, EI = 10⁶**. It is a dimensional load, not PR²/EI. Our equivalent normalized model uses R = 1 m, EI = 1 kN·m², EA = 10⁶ kN and reference P = 1 kN. Engine modulus input E = 1000 MPa, A = 1 m², I = 10⁻⁶ m⁴.

## Result

400 converged steps. The largest step load is **9.0112911888175** (step 267), +0.0412911888175 (+0.4603254%) from 8.97. The limit point, placed by a parabola through steps 266–268, is at PR²/EI = 9.0112954. The crown state there is interpolated (same parabola) from runs stopped at those three steps:

| Quantity | Published | Stabileo, 40 elements | Difference | Tolerance |
|---|---|---|---|---|
| PR²/EI | 8.97 | 9.011295 | +0.460% | 0.6% |
| u/R | 0.6116 | 0.611893 | +0.048% | 0.11% |
| v/R | 1.1372 | 1.137807 | +0.053% | 0.07% |
| rotation | 0.0498 | 0.051346 | +3.10% | 4% |

The final load factor is **4.824835941517055**: the trace passes the maximum and descends.

## Mesh study and tolerance budget

`mesh_step_and_axial_stiffness_study_bounds_the_tolerances` regenerates the arch from the shared case with 20, 40 and 80 elements (the 40-element mesh is checked to equal the shared case) and finds each limit point as above (`results/convergence.json`):

| Quantity | 20 | 40 | 80 | Observed order | Extrapolated | vs published |
|---|---|---|---|---|---|---|
| PR²/EI | 9.122988 | 9.011295 | 8.982580 | 1.96 | 8.972642 | +0.029% |
| u/R | 0.613392 | 0.611893 | 0.611538 | 2.08 | 0.611428 | −0.028% |
| v/R | 1.138928 | 1.137807 | 1.137448 | 1.65 | 1.137280 | +0.007% |
| rotation | 0.055734 | 0.051346 | 0.050241 | 1.99 | 0.049870 | +0.14% |

Extrapolated to zero element length (Richardson, observed order), every quantity agrees with the published value within half a unit of its last digit plus the 80-element grid-convergence index. The differences at 40 elements are discretization error.

Each tolerance is the 40-element grid-convergence index (1.25 × |q₄₀ − q_extrapolated| / q_extrapolated) plus half a unit in the last published digit (8.97: 0.056%; 0.6116: 0.008%; 1.1372: 0.004%; 0.0498: 0.1%), rounded up: budgets 0.594%, 0.103%, 0.062%, 3.80% give tolerances 0.6%, 0.11%, 0.07%, 4%. The test fails if a tolerance is below its budget or more than 1.25 times it. The rotation tolerance is large because the crown rotation passes its maximum shortly before the limit point and is the most mesh-sensitive quantity. Other budget terms, each checked: halving the arc-length step changes the limit load by less than 10⁻⁶ relative; ten times the axial stiffness changes it by less than 10⁻⁴ (finite EA versus the inextensible model); the discrete peak differs from the interpolated limit point by 5 × 10⁻⁷ relative.

The previous version used an underived 1% tolerance on the limit load only; the derived 0.6% is tighter. Regression bounds (10⁻⁶ absolute) remain on the step peak, the load at step 300 (8.418779219590325) and the final load.

## Data and replay

`engine/tests/benchmarks/dadeppo_arch.json` owns the full solver input, the published values and the tolerances; the native test and web worker read that same file. The solver returns complete nodal displacements only at the endpoint, so the replay and live computation rerun prefixes of 20, 40, …, 400 steps. Each frame is a real equilibrium result, never an interpolated shape. The chart plots load factor against step number; it does not mislabel the solver's first-free-DOF scalar as crown displacement. A full live recomputation also reruns the three steps around the peak to place the limit point in the browser.

## Run

From the repository root:

```sh
make test.engine.targeted TEST=solver FILTER=dadeppo_arch
DADEPPO_EXPORT="$PWD/research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json" DADEPPO_STUDY_EXPORT="$PWD/research/benchmarks/dadeppo-arch-1975/results/convergence.json" make test.engine.targeted TEST=solver FILTER=dadeppo_arch
make research.wasm
make web.run
```

Open `/en/research/benchmarks/dadeppo-arch-1975/` (also `/es/`, `/pt/`, `/de/`, `/fr/`, `/tr/`). Replay uses native production results; Recompute live uses the existing `initSolver` / `solveArcLength` WASM wrappers in a cancellable worker. Stop terminates the worker; a stopped or 20-step path is reported as incomplete, not as a failure. Restart restores replay. Autoplay pauses off-screen, stops on interaction, runs once on phones, and is disabled under reduced motion.

## Outside this page

- The full published equilibrium curve and the second limit point.
- Other opening angles, out-of-plane buckling, contact or material nonlinearity.

## Open questions

- The rotation sign convention of the 1975 table: the quotation gives 0.0498 without a convention we could check. The engine's `ry` is positive at the limit point and its extrapolated value (0.04987) matches; the test pins that sign, but the mapping is established by agreement, not from the source.
- Whether the 1975 table's values come from an inextensible formulation or a specific discretization; the converged Stabileo values agree with them to within their rounding, which suggests a converged inextensible solution.

The catalogue keeps `stage: first-version` and the conservative evidence status `implementation-in-progress`. Agreement here is a benchmark comparison, not experimental validation or certification.

The gallery's static SVG is a projection of native replay frame 260 (undeformed dashed, deformed blue), regenerated with `python3 -I research/benchmarks/dadeppo-arch-1975/render-thumbnail.py`. It is not a paper figure or a browser screenshot; the interactive page uses the shared viewer bundle.

## File inventory

- `engine/tests/benchmarks/dadeppo_arch.json`, `dadeppo_arch.rs`: shared case, published values, tolerances and native tests (limit load, crown state, mesh/step/axial-stiffness study); registered in `engine/tests/solver/main.rs`.
- `web/src/components/research/dadeppo1975/ArchPage.svelte`, `case.ts`, `solver.worker.ts`, `i18n.ts`, `__tests__/`: page, result mapping and checks, production WASM worker, text in six locales and tests.
- `web/src/components/research/ResearchPage.svelte`, `experiments.ts`, `Gallery.svelte`; `web/scripts/prerender.ts`: research-only registration, gallery and prerender route.
- `web/e2e/research-dadeppo.spec.ts`: replay, live result, viewer position, target and text sizes in six locales at 360×800, 390×844, 844×390 and 810×1080.
- `web/public/research-thumbs/dadeppo-arch-1975.svg`: image from the native run.
- `research/papers.yaml`, `research/papers.json`, `research/README.md`: catalogue and discovery.
- This directory: `README.md`, `paper.yaml`, `reference-results/limit-load.json`, `reference-results/MANIFEST.json`, `results/stabileo_results.json`, `results/convergence.json`, `results/MANIFEST.json`, `render-thumbnail.py`.
- `changelog.d/research-dadeppo-arch.md`: changelog fragment.
