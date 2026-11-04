### Changed
#### Docs, research prose and site-only changes run a smaller CI (2026-11-04)

A pull request that changes only docs, the changelog or research papers' prose (Markdown outside
`research/tools/`) now runs no build: repository lint, plus the research checks for research prose.
One that changes only the site (components, blog, locale strings, end-to-end tests, route budgets,
outside the package manifests and the compiled WASM) runs everything except the engine, AI-backend,
backend and CI-script jobs: WASM, the site build, the E2E site and every E2E shard still run.

The merge queue scopes each group by its combined changes the same way: a group of docs only runs no
build, and a group touching only the site, research or tools skips the engine jobs. Any group that
touches the engine, the toolchain or anything unrecognised runs the full queue set; pushes to main
and the nightly run still run everything.
