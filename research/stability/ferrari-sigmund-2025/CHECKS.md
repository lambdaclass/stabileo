# Review round 2 — 2026-10-30

Kimi → Codex → Claude consolidated findings addressed without production numerical changes,
Git writes, deleted tests or relaxed tolerances. Rejected findings remain rejected.

- Layout: compact heading and spacing at short landscape heights. The spec now has **14**
  Chromium cases: two replay/live interaction cases plus four viewport sizes × three
  translated locales (360×800, 390×844, 844×390, 810×1080; en/es/pt). Existing no-overflow,
  controls/canvas visibility, 44 px targets and 12 px text assertions are retained.
  **These updated Playwright cases were not executed here** (environment constraint).
  Kimi’s prior 10 passing cases do not validate the new landscape layout.
- Locale scope: research prerenders only en/es/pt. Policy and number formatting tests cover
  all six public locales; de/fr/tr are excluded from research prerendering, not represented
  as translated pages. Chart ticks follow locale decimal separators.
- References: rendered λ/α/β values come from `paper_values.json`; model dimensions, material,
  section, force, moment and mesh count come from `replay.model`. Rust contracts in both
  research and engine tests check the two builders against paper parameters at five meshes,
  including exact pinned support nodes, corner load and unreleased connectivity.
- Streaming: new runs enable follow; incoming frames only update the count. Slider selection
  and viewer interaction take control. Unit regression passes; a deterministic controlled-worker
  Playwright case checks the slider while additional frames arrive.
- Live scope: two published buckling comparisons plus native replay and native/WASM final
  path regression. No pending badge or author questions. README Open questions retains the
  unresolved coefficient/normalization work. Supporting author data are request-only according
  to the paper’s Data Availability Statement; no author arrays/code are in this checkout.
- Nits: derivative evidence regression tightened from absolute 1e-7 to relative 1e-3;
  original 2e-5 acceptance retained. Claim narrowed to the tested vertical element.
  README explains the numerical-versus-closed-form gap and unchanged 0.1% tolerance.

## Current executed checks

- From `web/`: `npx vitest run --project unit src/components/research src/lib/i18n/__tests__/hardcoded-text.test.ts`
  — **43 files, 206 tests passed**, including Ferrari component rendering, production WASM
  parity, playback, six-locale formatting/policy, and all three hardcoded-text checks.
- Research crate: `cargo test --locked -- --nocapture` — **5 integration tests passed**.
  Every saved frame and all four recorded derivative maxima were recomputed.
- Engine: `cargo test --locked -p dedaliano-engine --test validation research_benchmarks::ferrari -- --nocapture`
  — **3 tests passed**. Both native commands used
  `CARGO_TARGET_DIR=/private/tmp/claude-501/rfix-ferrari-2025-target CARGO_BUILD_JOBS=4`.
- `npm run typecheck`: 247 errors against baseline 247; no new errors on the final rerun.
- `npm run check:gate`: passed; repository-wide 343 errors and 262 warnings are informational
  baseline diagnostics. Full machine output confirms zero errors in changed research components.
- Research isolation: passed. Offline catalogue check: **48 papers, zero problems**.
- Research asset identity republished from the existing WASM/viewer after UI edits; no numerical
  WASM source changes. No tolerance or typecheck baseline updates.

## Follow-ups

No verified nit is left unaddressed: derivative orientation coverage was handled by narrowing
the claim. Optional horizontal/rotated derivative coverage and a stiff-axial analytical-limit
experiment remain future extensions. Execute the 14 Playwright cases in a browser-capable environment.

---

# Original implementation checks — 2026-10-29

The requested Koiter reproduction remains incomplete. This branch contains a deliberately
labelled implementation-in-progress page, not a validated reproduction of α, β or Figure 2b.
The full text was obtained; the unresolved work is numerical, not paper access.
See README.md for the benchmark, sources, measured numbers and author questions.

## Historical checks run

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
- Earlier Playwright spec: 10 Chromium cases (one replay/live test plus three viewport
  sizes in en/es/pt). Kimi subsequently ran all 10 successfully. The missing 844×390
  viewport was identified during that review; it was not covered by those passing cases.
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
