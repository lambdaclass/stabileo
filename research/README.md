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
  workflow on research/catalog PRs, pushes to main and weekly runs. Unrelated PRs do not run the online audit.

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

Research CI builds the event's base revision and the candidate in separate directories using the
candidate's pinned Nix toolchain and the same measurement script. Each installs its own locked
dependencies. The base build writes a temporary baseline; no candidate baseline is checked in.

Changes to shipped research JSON/CSV (outside `research/tools/`),
`web/src/components/research/`, `web/public/research-*` or
`web/vite.research-viewer.config.ts` retain the 128-byte per-route isolation tolerance.
This includes mixed product/research changes and merge-queue candidates. Without a base revision,
the comparison defaults to enforcing research isolation against main.

Every measured candidate also uses `web/scripts/product-route-growth-budgets.json`: at most
64 KiB of uncompressed growth per landing route and 256 KiB per app route relative to the base.
These separate product budgets allow incremental features while bounding dependency growth;
changes to these limits require review. They do not replace or increase the research tolerance.
Static research imports fail for both product and research changes.

The script measures uncompressed dependency bytes for `/en/`, `/es/`, `/pt/` and every `/app/*`
mode. Landing routes count the entry's static closure; app routes also count App's static and
lazy product dependencies. Explicit lazy research routes are excluded; static research imports
fail. HTML, bundled JS/CSS, manifest assets and statically referenced public files count once.
Runtime-generated asset URLs and the engine binary are outside this gate; a fixed engine stub
makes the measurements independent of locally built WASM.

For local comparisons, run `nix develop .. -c node scripts/check-research-route-size.mjs
--baseline /tmp/route-main.json --update` from the main build's `web/`, then the same command
without `--update` from the candidate's `web/`, using the same Nix toolchain for both.
`node --test web/scripts/research-route-budget.test.mjs` checks unchanged routes, the noise
allowance, missing measurements and negative cases for real landing/app growth.
