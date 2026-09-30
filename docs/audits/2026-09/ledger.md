# 2026-09 audit — ledger

Audit base: `main@7230135b` (2026-09-30, the #245 merge). One row per finding or question; the format,
severities and statuses are the plan's §3 (`plan.md`). Rows cite the plan's register IDs (K*, P*) where one
applies.

## Baseline @7230135b

| Suite | Command | Result | Notes |
|-------|---------|--------|-------|
| Engine | `cargo nextest run -p dedaliano-engine --profile ci --no-fail-fast` | 7,288 run: 7,287 passed, 1 failed, 13 skipped (310 s) | The failure is a wall-clock gate, `perf_regression_advanced::harmonic_3d_5x5_plate_under_15s`, at 79.6 s under the full parallel run; the plan measures these single-threaded (Task 0.4) |
| Backend | `cargo test -p dedaliano-backend` | 19 passed | |
| Web unit, gate, typecheck, smoke e2e | see below | pending | |
| Silenced tests | the plan's Step 5 greps | engine 17 `#[ignore]`; web 32 | Rows W13-03 to W13-05 |

## Findings

| ID | Module | Sev | Kind | Location (path:line @sha) | What breaks, and the evidence (test name or measurement) | Status | PR |
|----|--------|-----|------|---------------------------|-----------------------------------------------------------|--------|----|
| W13-01 | W13 | MEDIUM | hygiene | .github/workflows/ci.yml @7230135b | The @slow e2e suite runs on main only. #231 merged green and turned main red from `be38d4b5` (`concrete-copy-contrast.spec.ts:134`, 8 cases); #244 merged on top of the red. Supersedes K1. Decide: run @slow on PRs that touch `web/src/components`, or gate merges on main's last run. | open | |
| W9-01 | W9 | LOW | correctness | web/src/components/pro/design/ProQuantitiesCard.svelte:70 @7230135b | The quantities coverage line (9.6 px) read at 3.62:1 against the 4.5 AA small copy needs — `concrete-copy-contrast.spec.ts:134` in en, es and pt | fixed | Phase 0 |
| W13-02 | W13 | LOW | hygiene | web/vitest.setup.ts @7230135b | Node 25 defines `localStorage` without methods (no `--localstorage-file`); `tour-hold.test.ts` failed on a developer's Node while CI's Node 20 passed. The unit setup now replaces a broken global with an in-memory Storage | fixed | Phase 0 |
| W13-03 | W13, W1 | MEDIUM | question | web/src/lib/engine/__tests__/solver-mechanism.test.ts:106, :163; split-element.test.ts:187, :209 @7230135b | Four mechanism-detection tests are `it.skip` with no reason given (a portal with a double-hinged beam, an over-hinged node, hinges at a collinear node). A mechanism reported as a result is a HIGH if these cases still solve | open | |
| W13-04 | W13 | LOW | hygiene | web/e2e/detailing.spec.ts (9), f3-product-decisions.spec.ts (5) and 7 more specs @7230135b | 32 web tests silenced: 5 unconditional `it.skip`, 1 `it.todo`, and conditional `test.skip(<model produced nothing>)` that pass without asserting when the fixture changes | open | |
| W13-05 | W13, E3r | LOW | hygiene | engine/tests/sparse_shell_gates.rs (11), perf_regression_gates.rs (2), bench_phases.rs (2), pcg_solver_tests.rs (1) @7230135b | 17 `#[ignore]` in the engine: diagnostics and wall-clock comparisons, run by hand. None is a correctness gate; list kept for E3r | open | |
