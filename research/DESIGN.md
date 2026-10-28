# Stabileo Research: design

Status: agreed direction, 2026-10-28. "Research you can run": published computational-mechanics
papers as experiments anyone can run, change, compare and cite, on the same engine and viewer as
the Stabileo app. This document is the plan every research page and contribution follows.

## 1. What a visitor gets

**Gallery `/research`.** Cards: thumbnail rendered from a real run of our solver, title, authors,
year, field, evidence-based status, and four actions: **Read & run**, **Open in Stabileo**,
**Paper** (DOI), **Code**. Filters by field and status. Prerendered for search engines, in
es/en/pt (article text in English first; Spanish next, given the audience).

**Experiment page `/research/<field>/<id>`: two panes.**
- Left: the article, in our own words. What the paper shows; the model and its equations; how we
  reproduced it; the comparison with the reference (numbers, plots, tolerances); limitations;
  **Cite this**.
- Right, sticky: the Stabileo viewer (the app's own 2D/3D canvas), parameter controls, step
  slider and play, result plots. Links in the article drive it ("watch the crack initiate at step
  54", "try ℓ = 0.015").
- Phones: the panes stack; the experiment stays usable.
- **Every geometric view of a model or result uses Stabileo's own viewer** (the app's viewport
  with the generic scalar-field-on-mesh support), never a custom canvas or WebGL context; charts
  may stay charts. A research CI check enforces it.
- Every page says **"Research, not a design tool."**

**Open in Stabileo.** The full app in *research mode* (`/app/research/<id>`) with the experiment's
model loaded: edit geometry, supports and loads with the real tools, Solve runs the research
solver, results in the real viewer. (Phase 2; see §4.)

## 2. What counts as a status (evidence, never assigned by hand)

| Status | Evidence required (checked by CI from the experiment's files) |
|---|---|
| Proposed | A verified catalog entry (Crossref metadata, checked code licence) |
| Reference reproduced | The authors' code ran unmodified; its outputs are stored with versions and checksums |
| Implementation in progress | Our code exists; checks not yet complete |
| Numerically validated | Our results match the reference within documented tolerances, all checks green |
| Published figures compared | Additionally compared with the paper's own tables/figures (needs the text) |
| Interactive | The page runs our solver live |

Badges are generated from these files; a page cannot claim more than its evidence.

## 3. How it is built (one repo, one site, isolation by rule)

- **All on `main`.** No branches or forks per paper. Each paper: `research/<field>/<id>/` with its
  own Rust crate (own workspace), reference outputs and manifest, validation tests, `paper.yaml`,
  and the article content.
- **Isolation, enforced by CI:** the production engine and app never import research; research
  crates depend on the engine only through stable public APIs; research WASM is a separate bundle
  loaded only on research pages; the landing and the app must not grow (per-route byte ratchet).
- **Shared pieces, built once:** the experiment shell (two panes, article slot, app slot, Cite
  this), the gallery card, the viewer's generic "scalar field on a mesh" (damage, density,
  forces), plots, parameter controls. A new paper supplies content and a solver, nothing else.
- **Research CI** (path-filtered, not part of the product's required checks): catalog verification
  (Crossref, licences), each paper's validation tests, and a replay of every paper's reference
  outputs whenever `engine/`, the viewer or `research/` changes, so an engine change that shifts a
  research result fails loudly and someone decides whether it is a fix.

## 4. Research mode inside the app (phase 2)

A small **plugin contract**, designed from the three first papers' real needs, not guessed:
1. the model kinds it accepts (trusses; a 2D domain with supports and loads; a plate with a notch);
2. its parameters (rendered as a panel);
3. a step-by-step solve, in its own WASM;
4. the result fields it produces (for the viewer).

The app loads a plugin only when research mode opens. **Safety walls, in code:** a permanent
research banner; research results can never reach design checks, calculation reports or exports
labelled as engineering results; a project saved in research mode is marked as research. Order:
spring networks (trusses are native), topology optimization (2D domain), fracture (needs a notched
plate model). This is the first, small version of the versioned engine interface (#731).

**Graduation:** a research method can become a product feature only through the product's own
process: validation, the results snapshot gate, review by solver owners, a changelog entry.

## 5. Versions and citations

- **Permanent links by commit.** Every site build is also kept immutably under its commit, e.g.
  `stabileo.com/@9aad844/research/fracture/shauer-2025`: that exact app, engine and experiment,
  forever. The plain URL is always the latest. Only builds where research or the engine changed
  need keeping (≈20 MB each; object storage).
- **Cite this** gives the permanent link, commit, engine hash and the paper's DOI. Later: a Zenodo
  DOI per experiment version for formal citation.
- When a fix changes a research result, the experiment's page says what changed and why; the old
  permanent link keeps the old result.
- Prerequisite: reproducible WASM builds (#771). Hosting the `/@<commit>/` path needs the
  production host's owner (deploy infrastructure, #652).

## 6. Choosing papers

Rule (user, 2026-10-28): **only papers that are easy to do and give great, show-off results.**
Low implementation cost (reuse elements, solvers, viewer), honest validation that is easy to do
(open reference code or clear published numbers), and a striking interactive demo. Queue:
1. Shauer 2025 — phase-field fracture (validated, page in progress).
2. Topology optimization — Sigmund 2022 benchmarks, Andreassen et al. 2011 reference results.
3. Grossman 2026 — spring networks (trusses; validated against published numbers, no reference
   code — said plainly).
Each next candidate is scored on effort vs. demo impact before work starts.

## 7. Integrity

Verified citations only (Crossref); licences checked before adapting any code; no copied figures
or text (regenerate from our runs); "validated" only with evidence; limitations stated on the
page; research clearly separate from engineering design. Reference code and papers are untrusted
inputs: run in isolated environments.

## 8. Contributions and collaboration

- `research/CONTRIBUTING.md` + template: metadata, code, reference outputs, validation tests, the
  article. A contribution must include a test that reproduces a published number.
- Outside contributions follow the project's contribution policy (#726); `research/` has its own
  CODEOWNERS, separate from solver and design owners.
- **Outreach:** each validated experiment is sent to its authors ("we reproduced your paper; please
  review"). Their review is recorded on the page. First: Nathan Shauer; next: DTU (Sigmund's group)
  for topology optimization. Universities on the list: UBA, École Polytechnique, EPFL, ETH, DTU,
  Berkeley, Stanford.
- Messages and posts go out under the user's name: drafted by agents, sent by the user.

## 9. Quality bar for every page

Model and result views only through the shared Stabileo viewer (CI check); works on phones; loads fast (research bundles small; the viewer lazy); accessible (keyboard,
contrast, labels); es/en/pt UI with locale-aware numbers; no raw i18n keys; numbers parsed
safely; plot axes fit the data; a small e2e smoke per page in CI; a Lighthouse budget per research
route.

## 10. Milestones

1. **Ship the three pages** with the shared shell, the real viewer, the gallery. Review (Codex,
   Kimi) before production.
2. **Cite this + permanent links + research CI replay.**
3. **Research mode in the app** (plugin contract), spring networks first.
4. **Outreach** to the first authors; record their reviews.
5. Next papers by the effort-vs-impact rule.

## 11. Risks

- Scope creep into a framework: build only what the next paper needs.
- Confusing research with design results: the walls in §4, labels everywhere.
- Engine changes silently shifting research results: §3's replay.
- Agent capacity and usage limits: one paper at a time per agent; prefer the OVH server.
- Hosting old builds forever: keep only builds that changed research or the engine.
