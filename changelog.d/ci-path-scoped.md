### Changed
#### Docs, research prose and site-only changes run a smaller CI (2026-11-04)

A pull request that changes only docs, the changelog or research papers' prose (Markdown outside
`research/tools/`) now runs no build: repository lint, plus the research checks for research prose.
One that changes only the site (components, blog, locale strings, end-to-end tests, route budgets,
outside the package manifests and the compiled WASM) runs everything except the engine, AI-backend,
backend and CI-script jobs: WASM, the site build, the E2E site and every E2E shard still run.
