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
| `templates/` | Starting point for a new paper entry |
| `tools/` | Catalog checker and other research-only tooling |

## Isolation from the product

- Research crates are their own Cargo workspaces (`[workspace]` in their manifests); they are not
  members of the engine's or the backend's workspaces and have their own lockfiles.
- A research crate may depend on `engine/` through a path dependency. The engine and the web
  application never import research code. The web allowlist is `research/papers.json`,
  `research/<field>/<paper>/VALIDATION.json`, and CSV/JSON files in that paper’s
  `reference-results/`; the engine has no exceptions. `tools/check_isolation.sh` enforces this.
- Research CI is `.github/workflows/research.yml`, path-filtered, not part of the required checks.

## Reproducibility statuses

Statuses in `papers.yaml` are assigned from evidence in the repository, not by hand-waving:

| Status | Evidence required |
|--------|-------------------|
| `proposed` | Catalogued; metadata verified against Crossref |
| `reference-reproduced` | The authors' code ran here; its outputs are committed with the exact environment |
| `implementation-in-progress` | A Stabileo implementation exists but its validation tests do not yet pass |
| `numerically-validated` | Tests compare our implementation with the reproduced reference within documented tolerances, and pass in CI. This is agreement with the reference code; whether published numbers were reproduced is the separate `reproduced_published_results` field |
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

## Timing and previews

Completed live runs show device-local solve time, including model construction; WASM download/init
is separate. Replays, failed and stopped runs show no browser timing. Optional measured reference
timings come from `VALIDATION.json`; Python and native Rust share a machine, mesh and steps, but
Python also writes its original VTK/plots. Neither reference time predicts browser speed.
From the repository root, generate all three timings in an isolated environment:

```sh
nix develop -c python3 -m venv /tmp/reference-timing-venv
nix develop -c /tmp/reference-timing-venv/bin/pip install numpy==2.1.3 scipy==1.14.1 matplotlib==3.9.2
nix develop -c /tmp/reference-timing-venv/bin/python research/fracture/shauer-2025/reference/time_reference.py --runner-label "local $(uname -m)"
```

The hosted Research workflow also measures on reference/solver changes or manual dispatch and
uploads `research-reference-timing/VALIDATION.json`; it never commits. Review that artifact before
replacing the paper's `VALIDATION.json`. No measurement means no reference timing on the page.

Preview configuration lives in `web/src/components/research/preview-config.json` (replay path,
fixed view query, screenshot step, frame count and page selectors). With ffmpeg on PATH:

```sh
make research.wasm
cd web
nix develop .. -c npx playwright install chromium
nix develop .. -c npm run build
nix develop .. -c npm run research:previews
cd ..
python3 -I research/tools/check_previews.py
```

Capture starts its own Vite preview server, freezes replay playback, and emits 1200×630 PNG,
600×315 thumbnail, silent VP9 WebM and H.264 MP4 under `web/public/research/<area>/<slug>/`.
Videos are four seconds, suitable for looping; the existing two-pane page uses gallery and social
images rather than adding a second model view. Keep those files and `web/public/research/previews.json`
together. CI checks replay SHA-256 provenance and required assets, not pixel equality. Rebuild the
site after capture to include the new public assets. Initial capture must run before this gate passes.
