# Handoff and checks — 2026-10-29

The requested Koiter reproduction remains incomplete. This branch contains a deliberately
labelled implementation-in-progress page, not a validated reproduction of α, β or Figure 2b.
The full text was obtained; the unresolved work is numerical, not paper access.
See README.md for the benchmark, sources, measured numbers and author questions.

## Checks run

- Research crate: `cargo test --locked -- --nocapture`: four integration tests pass.
  This includes every stored arc-length frame, the buckling mesh sequence, all element
  energy partials through order four, and rejection of a noncritical linear candidate.
- Targeted Vitest: four new protocol/WASM tests and two research i18n tests pass.
- Full web unit suite: 1,293 test files passed, two skipped; 15,861 tests passed, 14 skipped.
  The additional native/WASM parity test was also run in the targeted suite.
- `make typecheck.web`: passes the existing baseline (247 TypeScript errors; no new errors),
  the guarded Svelte paths and shared-header check. Repository-wide Svelte diagnostics are
  not globally clean; none were reported for the new Ferrari components.
- All six existing `research/tools/test_*.py` scripts passed with isolated Python (`-I`).
  `test_required_ci.py` also checks the added Koiter groundwork job.
- Catalogue: offline and online Crossref checks passed, 22 papers, zero problems.
- `research/tools/check_isolation.sh`: passed.
- `python3 scripts/changelog.py --check`: passed.
- Playwright discovery: 13 Chromium cases, covering replay/live/stop/restart and all four
  requested viewport sizes in en/es/pt. **Not executed**; the maintainer runs Chromium.
  Responsive behaviour is therefore not yet visually verified.
- Production WASM was built from this checkout to satisfy the fresh-checkout test prerequisite.
  No engine numerical source was edited. No commits, pushes or other Git mutations were made.

Rust/Node commands ran in the pinned Nix shell, using a path flake and a temporary writable
Nix cache. The Python tooling used a temporary virtual environment with PyYAML.
No baseline was relaxed. No production route-size comparison against main was run.

## Source and evidence files created or edited

- `research/stability/ferrari-sigmund-2025/Cargo.lock`
- `research/stability/ferrari-sigmund-2025/Cargo.toml`
- `research/stability/ferrari-sigmund-2025/PUBLISHED_COMPARISON.json`
- `research/stability/ferrari-sigmund-2025/README.md`
- `research/stability/ferrari-sigmund-2025/VALIDATION.json`
- `research/stability/ferrari-sigmund-2025/reference-results/MANIFEST.json`
- `research/stability/ferrari-sigmund-2025/reference-results/paper_values.json`
- `research/stability/ferrari-sigmund-2025/results/stabileo_results.json`
- `research/stability/ferrari-sigmund-2025/src/energy.rs`
- `research/stability/ferrari-sigmund-2025/src/lib.rs`
- `research/stability/ferrari-sigmund-2025/src/main.rs`
- `research/stability/ferrari-sigmund-2025/src/model.rs`
- `research/stability/ferrari-sigmund-2025/src/replay.rs`
- `research/stability/ferrari-sigmund-2025/tests/buckling.rs`
- `research/stability/ferrari-sigmund-2025/tests/derivatives.rs`
- `research/stability/ferrari-sigmund-2025/tests/replay.rs`
- `.github/workflows/research.yml`
- `changelog.d/ferrari-sigmund-research.md`
- `research/README.md`
- `research/papers.yaml`
- `research/papers.json`
- `research/tools/test_required_ci.py`
- `web/src/components/research/ResearchPage.svelte`
- `web/src/components/research/Gallery.svelte`
- `web/src/components/research/i18n.ts`
- `web/scripts/prerender.ts`
- `web/e2e/research-ferrari.spec.ts`
- `web/src/components/research/ferrari2025/FerrariPage.svelte`
- `web/src/components/research/ferrari2025/__tests__/protocol.test.ts`
- `web/src/components/research/ferrari2025/protocol.ts`
- `web/src/components/research/ferrari2025/run.worker.ts`
- `research/stability/ferrari-sigmund-2025/CHECKS.md` (this file)
