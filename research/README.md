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


## Gallery showcase and previews

“Run it” contains only browser experiments registered in
`web/src/components/research/experiments.ts` with an existing repository-relative
`page` in `papers.yaml`. Catalogue-only papers stay in the catalogue below.

Set an optional positive integer `showcase` on a runnable paper to hand-order the
large cards (lower first). Ranks must be unique; they are not evidence or a status.
Currently Grossman has `showcase: 1` and Shauer has `showcase: 2`.
Runnable entries without a rank follow, sorted by year descending, then title.
After editing the catalogue, run `python3 -I research/tools/catalog.py export`;
`check --offline` validates the ranks, page files and generated JSON.

To publish a looping card preview, add an optional `preview` path to its
`experiments.ts` entry, relative to `web/public/`, for example
`research/metamaterials/grossman-2026/preview.webm` (or `preview.mp4`).
The existing `research-thumbs/<id>.webp` thumbnail remains its poster.
Only declare a preview after its asset is published: the gallery never probes
candidate URLs. Without a preview, under reduced motion, off screen, or after a
video failure, it shows the still. Videos load and play only while visible.

## Versions and reviews

**Ship first, review after: the page shows its review status.** Ship the first version
of a research paper to production after required CI and the page smoke check.
Codex plus Kimi or Grok review it afterward; improvements ship in follow-up PRs.
Review is not a prerequisite for the first production version.

Every runnable entry (an entry with `page`, or status `interactive`) requires
`version_stage: first-version|improved|complete`. Stage describes the implementation,
not numerical evidence or review approval. Catalogue-only entries may omit it.
Every paper's changelog fragment must state its stage and recorded review count.

An optional `reviews` list records individual reviews with these fields:

- `reviewer`: `codex`, `kimi`, `grok`, or `human`.
- `date`: quoted calendar date in `YYYY-MM-DD` form.
- `commit`: 7–40 hexadecimal characters identifying the reviewed version.
- `verdict`: `not ready`, `ready after should-fix items`, or `ready to merge`.
- `followup`: optional positive PR or issue number in this repository.

Omit `reviews` or use `[]` for no recorded reviews. Counts are records, not unique
reviewers, and do not imply approval. The page lists dates, commits and verdicts;
reviewer names in the badge are deduplicated. Export with `catalog.py export`.

The two existing experiments predate this workflow and had many Codex + Kimi rounds
before merge. Only their final rounds are recorded (two records per paper):
Shauer's “seventh review of #769” (`56cde2bb2`) and Grossman's “final review of #776”
(`79781efd6`), dated 2026-10-29 in `origin/main` history. Their records anchor to merge
commits `0ce459e9eb75d2de08cc3743591b125f74d72ff7` and
`41d1ab4f8a8a94e5407ec035024b3fa685388c21`, respectively. The conditional verdict
reflects the fixes described in those messages, rather than claiming an unrecorded
unconditional approval. Earlier rounds are not included in the displayed count.
