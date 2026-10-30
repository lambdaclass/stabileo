# Files in this first version

New experiment files:

- `Cargo.toml`, `Cargo.lock`: isolated crate and pinned Rust dependencies.
- `src/lib.rs`, `src/engine.rs`: fixed five-node SOCP, curve recovery, production-engine model/check.
- `tests/validation.rs`: eleven numerical checks and evidence freshness.
- `VALIDATION.json`, `PUBLISHED_COMPARISON.json`, `paper.yaml`: scoped validation and published source.
- `reference/run.py`, `reference/requirements.txt`: external unmodified GPL reference execution.
- `reference-results/MANIFEST.json`, `reference-results/five-node.json`: provenance, hashes and outputs.
- `results/stabileo_results.json`: published Rust result and engine input/check.
- `reference/thumbnail.py`: thumbnail generated from Rust output.
- `wasm/build.sh`, `wasm/check.mjs`: independent browser bundle and numerical smoke check.
- `README.md`, `THIRD_PARTY_NOTICES.md`, `FILES.md`: reproduction, limitations, licensing and inventory.

New web files:

- `web/src/components/research/fairclough2026/FaircloughPage.svelte`
- `web/src/components/research/fairclough2026/i18n.ts`
- `web/src/components/research/fairclough2026/model.ts`
- `web/src/components/research/fairclough2026/solve.worker.ts`
- `web/src/components/research/fairclough2026/__tests__/model.test.ts`
- `web/public/research-thumbs/fairclough-2026.svg`
- `web/e2e/research-fairclough.spec.ts`

Integration:

- `research/papers.yaml`, `research/papers.json`, `research/README.md`
- `research/tools/test_fairclough_catalog.py` (new)
- `web/src/components/research/ResearchPage.svelte`, `Gallery.svelte`, `experiments.ts`
- `web/scripts/prerender.ts`
- `Makefile`
- `.github/workflows/research.yml`, `ci.yml`, `supply-chain.yml`
- `changelog.d/fairclough-five-node-gridshell.md` (new)

Generated local build files under `web/src/lib/wasm/`, `web/public/research-wasm/`,
`target/` and dependency directories are build artifacts, not implementation source.
