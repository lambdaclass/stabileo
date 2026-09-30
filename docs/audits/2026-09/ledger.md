# 2026-09 audit — ledger

Audit base: `main@7230135b` (2026-09-30, the #245 merge). One row per finding or question; the format,
severities and statuses are the plan's §3 (`plan.md`). Rows cite the plan's register IDs (K*, P*) and cross-cutting patterns (C-*) where one
applies.

## Baseline @7230135b

| Suite | Command | Result | Notes |
|-------|---------|--------|-------|
| Engine | `cargo nextest run -p dedaliano-engine --profile ci --no-fail-fast` | 7,288 run: 7,287 passed, 1 failed, 13 skipped (310 s) | The failure is a wall-clock gate, `perf_regression_advanced::harmonic_3d_5x5_plate_under_15s`, at 79.6 s under the full parallel run; the plan measures these single-threaded (Task 0.4) |
| Backend | `cargo test -p dedaliano-backend` | 19 passed | |
| Web unit, gate, typecheck, smoke e2e | see below | pending | |
| Silenced tests | the plan's Step 5 greps | engine 15 `#[ignore]`; web 32 in 14 files | Rows W13-03 to W13-05 |

## Findings

| ID | Module | Sev | Kind | Location (path:line @sha) | What breaks, and the evidence (test name or measurement) | Status | PR |
|----|--------|-----|------|---------------------------|-----------------------------------------------------------|--------|----|
| W13-01 | W13 | MEDIUM | hygiene | .github/workflows/ci.yml @7230135b | The @slow e2e suite runs on main, and on a PR only with the `run-e2e` label (`ci.yml:374`), which #231 did not carry. It merged green and turned main red from `be38d4b5` (`concrete-copy-contrast.spec.ts:134`, 8 cases); #244, #232 and #245 merged on top of the red, so every main run since carries it. Supersedes K1. Decide: apply the label automatically to PRs that touch `web/src/components`, or gate merges on main's last run. #246 carries it. | open | |
| W9-01 | W9 | LOW | correctness | web/src/components/pro/design/ProQuantitiesCard.svelte:70 @7230135b | The quantities coverage line (9.6 px) read at 3.62:1 against the 4.5 AA small copy needs — `concrete-copy-contrast.spec.ts:134` in en, es and pt | fixed | #246 |
| W13-02 | W13 | LOW | hygiene | web/vitest.setup.ts @7230135b | Node 25 defines `localStorage` without methods (no `--localstorage-file`); `tour-hold.test.ts` failed on a developer's Node while CI's Node 20 passed. The unit setup now replaces a broken global with an in-memory Storage | fixed | #246 |
| W13-03 | W13, W1 | MEDIUM | question | web/src/lib/engine/__tests__/solver-mechanism.test.ts:106, :163; split-element.test.ts:187, :209 @7230135b | Four mechanism tests are `it.skip` with the TODO "needs pre-solve kinematic check — solver produces results instead of mechanism error". Checked 2026-09-30: unskipped, the raw engine `solve` still returns results for 3 of the 4; the app's solve refuses the same models (solver-service's kinematic pre-check: "Mechanism at node 4 (1 mechanism mode)"). The gap is any caller of the raw solve that skips the service — Task 1.2's map lists them. Then: run these four through the service path so they run, and say what the raw solve promises | open | |
| W13-04 | W13 | LOW | hygiene | web/src, web/e2e (14 files) @7230135b | 32 web tests silenced: 5 `it.skip` (4 are W13-03; 1 is a hinge curvature check in deformed-shape-3d), 1 `it.todo`, 2 `describe.skipIf` and 2 `it.runIf` on DXF files that live outside the repo, and 22 conditional `test.skip` in e2e (9 in detailing.spec.ts) that pass without asserting when the fixture stops producing what they look for | open | |
| W13-05 | W13, E3r | LOW | hygiene | engine/tests/sparse_shell_gates.rs (11), bench_phases.rs (2), perf_regression_gates.rs (1), pcg_solver_tests.rs (1) @7230135b | 15 `#[ignore]` in the engine: diagnostics and wall-clock comparisons, run by hand (nextest's 13 skipped are these without bench_phases). None is a correctness gate; list kept for E3r | open | |
| W13-06 | W13 | MEDIUM | hygiene | .github/workflows/ci.yml @7230135b | No CI job ran `npm run typecheck` or `npm run check:gate`, and no hook does: the TypeScript baseline and the svelte-check gate held only for whoever ran them. Now steps of `web-build` | fixed | #246 |
