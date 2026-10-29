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
(open reference code or clear published numbers), and a striking interactive demo. A second
criterion, weighted heavily: **the experiment shows what makes Stabileo good** — it runs on the
production engine (frames, trusses, shells, buckling, modal, P-Δ, arc-length), uses the real
viewer, and opens in the editor — rather than needing a separate solver.

Queue (2026-10-28; candidates verified through Crossref/arXiv, licences read from the repositories;
full report with runners-up and rejections kept with the scouting notes):

| # | Experiment | Paper | Runs on | Effort | Validation |
|---|---|---|---|---|---|
| 1 | Phase-field fracture | Shauer 2025, doi:10.1016/j.advengsoft.2025.104013 | research crate on the engine's sparse solve | done | reference code, 30/30 checks |
| 2 | Auxetic spring networks | Grossman & Boudaoud 2026, doi:10.1103/17sg-gzhl | research crate; editor embed on the production truss solver | in review (PR #776) | evidence pending merge |
| 3 | Topology optimization (MBB beam) | Sigmund 2022 benchmarks; Andreassen et al. 2011 reference results | shared Q4 core from #1 | ~3–5 days | the 2011 reference outputs |
| 4 | Post-buckling of frames (Koiter) | Ferrari & Sigmund 2025, IJNME 126 e70082, doi:10.1002/nme.70082 | production buckling, corotational, arc-length | ~5–7 days | Roorda frame closed-form (λ1, α, β) + our own exact arc-length path; no public code |
| 5 | Snapping arches by curvature patterning | Zmyślony, Khan & Biggins 2026, Phys. Rev. Research 8, 033168 | production Euler buckling modes | ~3–4 days (passive) | analytic snap thresholds; Zenodo data (CC-BY-4.0) |
| 6 | Snap-through of a cut strip | Fehér 2026, Eur. J. Mech. A/Solids 120, 106217 | 2D frame with varying stiffness | ~3–4 days, shares #5 | values read off the figures (no tables) |
| 7 | Form-finding of cable nets and shells | Pastrana, Oktay, Bletzinger, Adams & Adriaenssens 2026, CMAME 458, 118783 | sparse solve; the found form opens in the editor as a gridshell and is checked with 3D analysis and buckling | ~5–7 days | `jax_fdm` (MIT) reference |
| 8 | Gridshell layout under self-weight | Fairclough, Bołbotowski, He, Liew & Gilbert 2026, Computers & Structures 320, 107997 | new conic optimiser (Clarabel.rs, Apache-2.0) | ~7–10 days | Table 1 volumes |

Order: 3 (quick, famous) → 4 (strongest showcase of the production engine; same DTU group) → 5 and
6 together (shared 2D stability tooling) → 7 → 8. Known engine limits that pushed other papers
down: arc-length is 2D only; no nonlinear shells. Before starting each, re-check: open questions
(e.g. the Roorda geometry needs the paper's text; the Zenodo archive for #5 not yet inspected; the
script link for #8 to ask the authors).

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
6. The long-term direction (§11), starting with one benchmark, many methods; then the platform (§12).

## 11. Long-term direction: from a gallery we fill to the place the field publishes

Doing every paper ourselves stays small. The goal is that researchers, students and labs do most
of the work because it is worth it to them. In order of leverage:

1. **One benchmark, many methods** (next after the first three experiments). Standard problems
   (the notched plate, the MBB beam, …) with fixed geometry, meshes and metrics; every method on
   the same problem, side by side, with comparison tables of accuracy against cost. A new paper
   in an area lands on its area's benchmark. Nobody offers this for computational mechanics.
2. **Authors publish their own runnable papers.** The contribution template and CI make it easy;
   academic credit makes it worth it: a citable DOI per experiment version (Zenodo), the author's
   review recorded on the page, and later journal partnerships accepting a Stabileo experiment as
   supplementary material. Our cost per paper becomes review, not implementation.
3. **AI-assisted reproduction.** A pipeline that reads a paper and its code, drafts the Rust
   implementation and its validation against the reference, and hands it to a human reviewer;
   a "Reproduce this paper" entry point taking a DOI. The integrity rules (evidence-based status,
   verified citations, summaries only from real sources) are what make it trustworthy at scale.
4. **Fork and share.** Anyone changes an experiment's parameters, geometry or material law and
   gets a permanent link (§5), so students fork a professor's experiment and researchers fork each
   other's.
5. **Teaching.** Experiments as course material: assignments run in the browser with nothing to
   install. Students who learn on Stabileo become engineers who use it.
6. **Real experiments.** Laboratory test data next to the simulations (UBA, INTI as first partners):
   validation against physics, not only agreement with another code.

Order: finish the first three experiments; then 1 (cheap, unique); then 2 (credit, DOIs, outreach
to Shauer and DTU); then 3 once the template has proven itself; 4 follows from §5; 5 and 6 with
academic partners.

## 12. The platform: GitHub for computational mechanics, safely

> **Not now.** For now Stabileo runs the experiments and the comparisons itself: we choose the
> papers, implement them, validate them and publish them, and no outside code runs anywhere. This
> section is the later direction, written down so today's choices don't block it; nothing in it is
> built until the curated experiments and the benchmarks (§11.1) have proven the format.

**Build on GitHub, not instead of it.** Researchers keep their code on GitHub. A repo adds one
small file, `stabileo.yaml` (model, solver, parameters, reference outputs, article — the
structure `research/` already uses, published as an open format), and connects to Stabileo.
On every push Stabileo builds it and gives a live page (Stabileo's viewer, two panes, autoplay),
a permanent link per version (§5), and **verification badges computed by us** ("reproduces the
reference", "validated against these published numbers", "runs on the standard benchmark",
"compared with lab data"): the trust layer GitHub does not have. Then a social layer (profiles,
forks, stars, comments, reviews; accounts exist in the backend) and embeds for courses, blogs and
HTML papers. Order: our curated content first; then open the format; seed with partners (Shauer,
DTU, UBA courses); profiles and social once there is enough to browse.

**Security: outside code is hostile until proven otherwise.** The same walls GitHub and Hugging
Face use, plus ours:

| Wall | How |
|---|---|
| Separate domain | Community experiments are served from their own domain, one isolated subdomain each (`<experiment>.<usercontent domain>`), registered on the Public Suffix List (like `github.io`, `hf.space`); never from stabileo.com |
| Sandboxed frames | On stabileo.com a community experiment appears only in a sandboxed iframe, no same-origin access |
| Narrow channel | Their code sends data (mesh, fields) through a checked message channel; **our** viewer draws it |
| Data, not code | Results and reference outputs in a pure-data format (the `safetensors` idea): viewing never runs anyone's code |
| Explicit opt-in | Running a community solver is an explicit click under "Community · not reviewed" (the `trust_remote_code` idea) |
| Disposable builds | Builds in throwaway sandboxes: no secrets, no network, time/CPU limits; never on our CI runners or on servers shared with other projects |
| Unforgeable badges | Badges are computed by our isolated system and signed; a repo cannot claim one |
| Product stays clean | Community code never enters this repository or the engine; curated `research/` goes through full review |
| Abuse | Account to publish, rate and size limits, report button, scanning, takedowns, a copyright process |

Rollout: invite-only for partners → security review or external penetration test → open with
moderation.

**Compute.** The browser (WASM) stays the default and is free. Server runs only for what the
browser cannot do (long runs, 3D meshes, GPUs, authors' Python reference codes), each in its own
disposable **micro-VM (Firecracker) or gVisor-sandboxed container** — plain containers share the
host kernel and are not enough for untrusted code: no secrets, no network by default, CPU/memory/
time limits, destroyed after the run, results returned as pure data. On dedicated machines only
(never on hosts shared with other projects or on CI runners); GPUs as a paid or sponsored tier.
Heavy results are cached with permanent links, so a run is computed once and replayed for every
visitor.

## 13. Risks

- Scope creep into a framework: build only what the next paper needs.
- Confusing research with design results: the walls in §4, labels everywhere.
- Engine changes silently shifting research results: §3's replay.
- Agent capacity and usage limits: one paper at a time per agent; prefer the OVH server.
- Hosting old builds forever: keep only builds that changed research or the engine.

## 14. Engine benchmarks

Research pages in this track **are the production engine's benchmarks**. They run the WASM
built into `web/src/lib/wasm` through the existing `web/src/lib/engine` wrappers, the same
engine used to design buildings. There is no separate research solver.

The engine owns one case file under `engine/tests/benchmarks/`: geometry, connectivity,
materials, loads, element family, measurement, published reference with table/page provenance,
and tolerance. Native tests and the research page read that same file. Record adaptations,
different meshes and historical regression bounds separately from published accuracy targets;
never loosen an assertion or change `engine/src` to make a page pass. Research code is never
imported by the product (`research/tools/check_isolation.py` enforces the boundary).

The page runs on load and on **Run again**, with no replay requirement. Its headline and table
are computed live, including reference, computed value, relative error and pass/fail. Failed
cases remain visible and count in the denominator, with links to their engine known-issue
entries. Missing registry entries must be disclosed and referred to the solver owner; do not
invent an issue or silently classify a regression floor as an accuracy pass. APIs unavailable
in WASM are labelled **covered in native CI only**, with exact test names. A shared Stabileo
viewer shows the selected mesh and deformed shape, and **Open in Stabileo** uses the editor's
existing import/share format. Use ExperimentShell, PaneTabs, VerificationSummary, Cite this,
SiteHeader, en/es/pt UI and the gallery catalogue's summary-source rules.

Existing engine CI runs the native cases. Hosted runners in the Research workflow compare the
production WASM results in Node with freshly computed native values and classifications; a
cached report is not a live browser result. Research bundles remain route-isolated.

Queue:
1. **MacNeal–Harder (1985)** — `/research/benchmarks/macneal-harder-1985`.
2. **Riks/Crisfield snap-through** — production `engine/src/solver/arc_length.rs`.
3. **Zienkiewicz–Zhu** — production error estimation and mesh refinement.

Classics go through the engine. New papers stay separate experiments when the engine cannot
run them, isolated from the product; this exception does not authorize a replacement production
solver or relax the product's validation/review process.
