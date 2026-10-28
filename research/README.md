# Stabileo Research

Research you can run: computational-mechanics papers whose numerical experiments are reproduced,
re-implemented and made interactive, with the evidence for each claim kept next to the code.

This directory is **research, not engineering design**. Nothing here is used by the Stabileo
application or its solver, and no result here is a design result. A benchmark agreement is not a
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
  application never import from `research/`; `tools/check_isolation.sh` fails CI if they do.
- Research CI is `.github/workflows/research.yml`, path-filtered, not part of the required checks.

## Reproducibility statuses

Statuses in `papers.yaml` are assigned from evidence in the repository, not by hand-waving:

| Status | Evidence required |
|--------|-------------------|
| `proposed` | Catalogued; metadata verified against Crossref |
| `reference-reproduced` | The authors' code ran here; its outputs are committed with the exact environment |
| `implementation-in-progress` | A Stabileo implementation exists but its validation tests do not yet pass |
| `numerically-validated` | Tests compare our implementation with the reproduced reference within documented tolerances, and pass in CI. This is agreement with the reference code; whether published numbers were reproduced is the separate `reproduced_published_results` field |
| `interactive` | Validated, and runnable on stabileo.com/research |
