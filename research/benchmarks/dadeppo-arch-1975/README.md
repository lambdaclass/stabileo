# DaDeppo–Schmidt (1975): deep circular arch

**First version · 0 reviews. Research, not a design tool.**

One example: a 215° circular arch, clamped left and pinned right, with a downward dead point load at its crown. Forty straight production corotational frame elements and the production Crisfield arc-length solver trace the first limit point. No new solver or engine numerics are introduced. Effort/impact: low implementation effort using existing APIs; a visible large-displacement instability and a published scalar comparison.

## Reference and units

DaDeppo, D. A. and Schmidt, R. (1975), “Instability of Clamped-Hinged Circular Arches Subjected to a Point Load”, Journal of Applied Mechanics 42(4), 894–896. DOI: https://doi.org/10.1115/1.3423734. Metadata obtained with `research/tools/catalog.py show` and verified with its Crossref checker.

Robert Schmidt's 2000 discussion, Journal of Engineering Mechanics 126(12), p. 1308, explicitly quotes Table 1 of the 1975 paper: **PR²/EI = 8.97**, u/R = 0.6116, v/R = 1.1372. Source: https://userweb.eng.gla.ac.uk/sondipon.adhikari/fulltext/journal/ft7a.pdf (second PDF page). Only the load is compared in this first version. The original 1975 table was not directly inspected; this is a verified quotation by its coauthor. No reference code or copyrighted figures are copied.

The frequently reported **P = 897** uses **R = 100, EI = 10⁶**. It is a dimensional load, not PR²/EI. Our equivalent normalized model uses R = 1 m, EI = 1 kN·m², EA = 10⁶ kN and reference P = 1 kN. Engine modulus input E = 1000 MPa, A = 1 m², I = 10⁻⁶ m⁴. The finite axial stiffness approximates the inextensible analytical model.

## Result

400 converged steps: maximum **9.0112911888175**, difference **+0.0412911888175 (+0.4603254%)** from 8.97. Equivalent dimensional load **901.1291189** versus **897**. Final load factor **4.824835941517055** proves that the trace passed the maximum. The test requires completion, a descending branch at least 5% below the peak, the published-reference error below 1%, and a separate 10⁻⁶ absolute regression bound on the observed peak. No existing tolerance is changed.

`engine/tests/benchmarks/dadeppo_arch.json` owns the full solver input and reference. The native test and web worker read that same file. The solver returns complete nodal displacements only at the endpoint, so the replay and live computation rerun prefixes of 20, 40, …, 400 steps. Each frame is a real equilibrium result, never an interpolated shape. The chart plots load factor against step number; it does not mislabel the solver's first-free-DOF scalar as crown displacement.

## Run

From the repository root, inside its Nix environment:

```sh
nix develop -c cargo test --manifest-path engine/Cargo.toml --test solver dadeppo_arch -- --nocapture
DADEPPO_EXPORT="$PWD/research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json" nix develop -c cargo test --manifest-path engine/Cargo.toml --test solver dadeppo_arch -- --nocapture
make wasm
make web.run
```

Open `/en/research/benchmarks/dadeppo-arch-1975/` (also `/es/` and `/pt/`). Replay uses native production results; Recompute live uses the existing `initSolver` / `solveArcLength` WASM wrappers in a cancellable worker. Stop terminates the worker. Restart restores replay. Autoplay pauses off-screen, stops on interaction, runs once on phones, and is disabled under reduced motion. All geometric views use Stabileo's ScalarFieldViewer. No app locale dictionaries are changed.

## Not yet

- Mesh and step-size convergence study; exact interpolation of the limit point.
- Full published curve and second limit point.
- Other opening angles, out-of-plane buckling, contact or material nonlinearity.
- Independent reviews and direct inspection of the original 1975 table.

The catalogue keeps `stage: first-version`, `reviews: []` and the conservative evidence status `implementation-in-progress`. Agreement here is a benchmark comparison, not experimental validation or certification.

The gallery's static SVG is a projection of native replay frame 260 (undeformed dashed, deformed blue), regenerated with `python3 -I research/benchmarks/dadeppo-arch-1975/render-thumbnail.py`. It is not a paper figure or a browser screenshot; the interactive page uses the shared viewer bundle.

## Verification in this checkout

Native limit-load regression and five benchmark Vitest checks (including the real production WASM wrapper) pass. Catalogue tests, offline export check, online Crossref check for this entry, isolation and shared-viewer checks pass. The route comparison against the untouched branch HEAD reports 2,187,096 bytes for each landing locale before and after: **0 added bytes**. App closures differ by +6 bytes, within the unchanged 128-byte gate; the gate passes.

The full web unit run completed with 15,853 passing tests, 14 skipped and nine timeouts in seven existing files. Serial retries still time out in existing variable-section/taper/steel-optimiser tests; no timeout or numerical tolerance was changed. Browser e2e and visual checks at 360/390/810 px could not run here: Chromium launch is denied by the macOS sandbox (`bootstrap_check_in ... Permission denied`), and browser UI access was not approved. The e2e spec is included for a permitted environment. These limitations are not a numerical validation claim for the full paper.

## File inventory

- `engine/tests/benchmarks/dadeppo_arch.json`, `dadeppo_arch.rs`: shared case and native test; registered in `engine/tests/solver/main.rs`.
- `web/src/components/research/dadeppo1975/ArchPage.svelte`, `case.ts`, `solver.worker.ts`, `i18n.ts`, `__tests__/case.test.ts`: page, result mapping, production WASM worker, en/es/pt text and tests.
- `web/src/components/research/ResearchPage.svelte`, `experiments.ts`, `Gallery.svelte`; `web/scripts/prerender.ts`: research-only registration, gallery and prerender route.
- `web/e2e/research-dadeppo.spec.ts`: replay/live-result and layout checks at 360/390/810 px.
- `web/public/research-thumbs/dadeppo-arch-1975.svg`: image from the native run.
- `research/papers.yaml`, `research/papers.json`, `research/README.md`: catalogue and discovery.
- This directory: `README.md`, `paper.yaml`, `reference-results/limit-load.json`, `reference-results/MANIFEST.json`, `results/stabileo_results.json`, `results/MANIFEST.json`, `render-thumbnail.py`.
- `changelog.d/research-dadeppo-arch.md`: first-version / 0-review fragment.

`nix develop -c make typecheck.web` passed its TypeScript baseline, guarded Svelte checks and site-header check earlier in the session. The final rerun again reported 247 TypeScript errors against the unchanged 247-error baseline (no new errors), then failed before Svelte checking because the Nix-store `npm` executable disappeared during execution. A clean environment rerun is still needed for the final complete gate.
