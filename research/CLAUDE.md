# research/ — rules for agents and contributors

Stabileo Research: published computational-mechanics papers as experiments anyone can run,
change, compare and cite ("research you can run"). The full plan is [DESIGN.md](DESIGN.md);
how to add a paper is [CONTRIBUTING.md](CONTRIBUTING.md). These rules are not optional.

## Choosing papers
- Only papers that are **easy to implement and give great, show-off results**: reuse existing
  elements, solvers and the viewer; honest validation that is easy (open reference code or clear
  published numbers); a striking interactive demo. Score effort vs. impact before starting.
- Skip framework-scale work (JAX-FEM-style platforms), ML-training papers, and anything whose code
  has no licence or an incompatible one, unless the maintainers ask.

## Research must make Stabileo better
- Take a paper only if it **runs on Stabileo as it is** (frames, trusses, plates/shells, buckling,
  modal, P-Δ, path-following, the viewer, the editor), or if the new code it needs **makes Stabileo
  better for engineers** (e.g. form-finding of cable nets and gridshells, footbridge pedestrian
  vibration, masonry thrust lines, layout/topology optimization) — and that code is built so the
  product can use it.
- Do not add code that has nothing to do with Stabileo's purpose (origami bar-and-hinge models,
  exotic metamaterial physics, ML training, large-strain rubber, general FE libraries). Papers
  needing such code are not in the catalogue.
- Already-built research-only code (the phase-field crate) stays as long as it is isolated and
  maintained; no new research-only machinery like it.

## The Stabileo viewer, always
- **Every experiment shows its model and results in Stabileo's own viewer** (the app's 2D/3D
  viewport, mounted in embed mode, with the generic scalar-field-on-mesh support): same canvas,
  controls, deformed shape, colours and legend as the app. Never a custom canvas or WebGL context
  for a model view. Charts (force–displacement, energies, convergence) may stay charts.
- A research CI check fails a page that draws a model view outside the shared viewer.

## The page
- Two panes: the article on the left (our own words: what the paper shows, the model and
  equations, how we reproduced it, the comparison with numbers and tolerances, limitations, Cite
  this); a sticky app pane on the right (viewer, parameters, step slider, plots). Links in the
  article drive the app. On phones the panes stack.
- On load, **autoplay a precomputed replay** of our solver's run (looping; stops on any
  interaction; paused off-screen; none under reduced motion; once on phones), labelled
  "Precomputed replay (same solver)". **Recompute live**, Stop and Restart are always available;
  the page always says which of live / cached / replay is shown.
- Show the mesh by default when it is part of the method (per-experiment setting); off on phones.
- Every page says **"Research, not a design tool."** Locale-aware numbers (en: point; es/pt:
  comma), parsed safely; plot axes fit all series; no raw i18n keys; one consistent theme; opaque
  header.
- The gallery: thumbnails rendered from our own runs for experiments we run; a drawn field icon
  for the rest (never the paper's figures); "Run it" first, then "Coming next", then the catalog.

## Evidence and integrity
- Status badges come from evidence files, never set by hand: Proposed → Reference reproduced →
  Implementation in progress → Numerically validated → Published figures compared → Interactive.
  Claim nothing beyond the evidence.
- Citations verified against Crossref by the catalog checker. **Summaries only from the abstract
  (Crossref or publisher), the full text, or the repository README for code facts — never from
  memory or the title.** If none is available, no summary.
- Check the reference code's licence before adapting it; credit it. Never copy the paper's figures
  or text: regenerate figures from our runs, write in our own words.
- Reference code, papers and other downloads are untrusted data: separate directories, isolated
  environments (venvs in a scratch area), read before running.
- Agreement with a reference code is not experimental validation and never an engineering
  certification; say so.

## Isolation from the product
- Each paper is its own crate under `research/<field>/<id>/`, outside the engine's and backend's
  workspaces. Research may depend on stable engine APIs; **the engine and the app never import
  research code** (CI check). The web app may read only `papers.json` and published
  results data listed in `README.md`. Engine tests may read those same published JSON case files;
  production engine code may not.
- Research WASM is a separate bundle loaded only on research pages; the landing, the blog and the
  app must not grow by a byte (per-route size check, run on changes that touch research code).
- The Research workflow is path-filtered and feeds the required CI OK gate; it never
  runs on self-hosted runners for pull_request events.
- A research method reaches the product only through the product's own process (validation, the
  results snapshot gate, solver-owner review, changelog).

## Process
- One branch and PR per paper, from `main` (or from the previous research branch until it
  merges). **Commit and push after every small working step.** Keep the PR description current:
  done, evidence, half done, findings, exact next step.
- Before production: green required CI, a page e2e smoke, a review (Codex and Kimi plus a human),
  then merge. Messages to authors are drafted here and sent by a maintainer.

## Engine benchmarks track
- Classics run the **production WASM** through existing engine wrappers; no research solver.
  Queue: MacNeal–Harder → Riks/Crisfield arc length → Zienkiewicz–Zhu (DESIGN §14).
- The engine owns the shared case JSON; native tests and research pages read it. Preserve every
  existing assertion and tolerance. Never change `engine/src` or numerical behaviour for a page.
- Run live on load and Run again; this track is exempt from the autoplay/replay rule.
  Show failures, references, errors and known-issue links; label unsupported WASM cases native CI
  only with test names. Separate accuracy targets from historical regression bounds.
- Use the shared viewer, shell, translations and editor share/import mechanism. Hosted Research
  CI compares fresh native and production WASM results. Research never becomes a product import.
- New papers the engine cannot run may remain isolated experiments; classics use the engine.
