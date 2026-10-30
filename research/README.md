# Stabileo Research

Research you can run: computational-mechanics papers whose numerical experiments are reproduced,
re-implemented and made interactive, with the evidence for each claim kept next to the code.

This directory is **research, not engineering design**. The application may read the catalogue and published results data, but never research code;
no result here is a design result. A benchmark agreement is not a
certification.

The plan every page and contribution follows is [DESIGN.md](DESIGN.md).

## Layout

| Path | What |
|------|------|
| `papers.yaml` | Curated catalog. Bibliographic fields are checked against Crossref by `tools/catalog.py` |
| `fracture/shauer-2025/` | Phase-field fracture (AT2), after Shauer (2025), reference code and Rust implementation |
| `metamaterials/grossman-2026/` | Spring networks after Grossman & Boudaoud (2026): moduli, auxetic foam, honeycomb, against the paper's published values |
| `stability/ferrari-sigmund-2025/` | Roorda-frame buckling and energy derivatives; Koiter reproduction in progress |
| `templates/` | Starting point for a new paper entry |
| `tools/` | Catalog checker and other research-only tooling |

## Isolation from the product

- Research crates are their own Cargo workspaces (`[workspace]` in their manifests); they are not
  members of the engine's or the backend's workspaces and have their own lockfiles.
- A research crate may depend on `engine/` through a path dependency. The engine and the web
  application never import research code. The web allowlist is `research/papers.json`,
  `research/<field>/<paper>/VALIDATION.json`, and CSV/JSON files in that paper’s
  `reference-results/`, plus `results/stabileo_results.json`; the engine has no exceptions. `tools/check_isolation.sh` enforces this.
- Research CI is `.github/workflows/research.yml`. Its offline checks (validation, reference hashes,
  catalogue, isolation, route budgets) are part of the required CI OK whenever research, web or engine
  files change; the online checks (Crossref, licences, links) run only as the standalone Research
  workflow, so an outage elsewhere can't block a merge.

## Reproducibility statuses

Statuses in `papers.yaml` are assigned from evidence in the repository, not by hand-waving:

| Status | Evidence required |
|--------|-------------------|
| `proposed` | Catalogued; metadata verified against Crossref |
| `reference-reproduced` | The authors' code ran here; its outputs are committed with the exact environment |
| `implementation-in-progress` | A Stabileo implementation exists but its validation tests do not yet pass |
| `numerically-validated` | Tests compare our implementation with the reproduced reference within documented tolerances, and pass in CI. When the authors publish no code, the reference is the paper's published values plus exact results (see that experiment's README). Whether published numbers were reproduced is the separate `reproduced_published_results` field |
| `published-figures-compared` | Numerical validation plus `reproduced_published_results: true` and `PUBLISHED_COMPARISON.json` with passing checks naming published sources, metrics, observations and tolerances |
| `interactive` | Numerical validation plus an existing repository-relative `page` file; this does not imply published-results agreement |

`summary_source` is declared provenance for human review, not machine-verified summary content.
The checker verifies the allowed source label; it does not compare the prose to the source.

## Product route size baseline

Research CI builds `main` and the candidate in separate directories using the candidate's
pinned Nix toolchain and the same measurement script. Each installs its own locked dependencies.
The main build writes a temporary baseline; the candidate compares against it with a 128-byte
per-route tolerance. No baseline from this PR is accepted or checked in.

The budget measures a change that touches research code or data shipped to the browser: the JSON and
CSV files under `research/` (outside `research/tools/`), `web/src/components/research/`,
`web/public/research-*` and `web/vite.research-viewer.config.ts`, plus every push to main. A product change with none of these
(a landing section, a nav item) grows the routes on purpose and is reviewed as product; it is not measured.

The script measures uncompressed dependency bytes for `/en/`, `/es/`, `/pt/` and every `/app/*`
mode. Landing routes count the entry's static closure; app routes also count App's static and
lazy product dependencies. Explicit lazy research routes are excluded; static research imports
fail. HTML, bundled JS/CSS, manifest assets and statically referenced public files count once.
Runtime-generated asset URLs and the engine binary are outside this gate; a fixed engine stub
makes the measurements independent of locally built WASM.

The catalogue (`research/papers.json`), experiment registry (including thumbnail metadata),
gallery strings and research translations (`components/research/i18n.ts`) are imported only
below `ResearchPage.svelte`. Root and App dynamically import `components/research/load-page.ts`,
which in turn dynamically imports ResearchPage. Keep both boundaries: a direct dynamic import
of ResearchPage puts Vite's transitive preload filename list into Root/App, so adding a paper
can grow product bytes even without a static import of the paper's data. The loader has no
static dependencies; its preload list lives on the research side of the boundary. Shared
navigation labels (`landing.navResearch`, `blog.tag.research`) remain public and do not grow
with the catalogue. Prerendering still opens every research URL and waits for its rendered page.

The route-size gate also checks Rollup's module membership: any chunk containing a research
component, registry, translation module or research JSON is forbidden in the landing's static
closure and App's product dependency closure. Thus adding an experiment entry cannot add a
static product import unnoticed, even if the entry is smaller than the byte tolerance. The
byte comparison additionally catches generated preload metadata growth. Do not move per-paper
strings into public locale dictionaries or add static imports to the lazy loader.

For local comparisons, run `nix develop .. -c node scripts/check-research-route-size.mjs
--baseline /tmp/route-main.json --update` from the main build's `web/`, then the same command
without `--update` from the candidate's `web/`, using the same Nix toolchain for both.
`node --test web/scripts/research-route-budget.test.mjs` checks unchanged routes, the noise
allowance, missing measurements and negative cases for real landing/app growth.
