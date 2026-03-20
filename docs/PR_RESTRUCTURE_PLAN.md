# Stabileo — PR Restructure Plan

> Plan for cleaning up and reordering the PR queue so the work can be merged cleanly.

## Why Restructure

The current working branch (`feat/a2-ai-access-config`) accumulated multiple product features as uncommitted local changes on top of a complex merge base. This happened because:

1. The original branch was created for AI A2 work, then became the long-lived working branch for all subsequent PRO product work (Steps A through E)
2. Multiple upstream PRs (pro-verification-qa, showcase-examples, bombonera-update) were merged locally for testing
3. The result is a single branch with ~21 merge commits + ~17 modified/new files spanning unrelated feature scopes

This makes it impossible to create clean, reviewable, theme-scoped PRs from the current state. The restructure splits the work into logical, independently reviewable PRs.

## Current State

- **Main working branch**: `feat/a2-ai-access-config`
- **Committed on branch**: AI A2 config (1 commit) + multiple merge commits from upstream
- **Uncommitted local work**: Steps A through E + Bombonera + classification fix + visual improvements
- **Temporary branches already deleted**: `pr/bombonera-update` (was merged into working branch, local copy deleted; remote PR #38 still open)
- **Origin/main**: up to date with all numbered PRs [1]–[8] + Z-up fixes

## Principles for PR Splitting

1. **One theme per PR**: each PR should have a clear, single purpose
2. **PRO-first**: all product PRs are framed as PRO mode improvements
3. **Solver code stays out**: no product PR should touch `engine/**` Rust/WASM internals
4. **Base on origin/main**: each new PR branch should be created from the latest `origin/main`
5. **Cherry-pick or recreate**: for each PR, either cherry-pick the relevant changes or recreate them cleanly from the working tree
6. **Merge order matters**: some PRs depend on others (e.g., Step B depends on Step A's types)
7. **Test each PR independently**: `npm run build` must pass on each PR branch

## Intended New PR Structure

| PR | Theme | Key Files | Depends On |
|----|-------|-----------|------------|
| Bombonera | La Bombonera 1005-node example | generators.ts, la-bombonera.json, fixture-index.ts, test, ProPanel.svelte, i18n | origin/main only |
| AI A2 | BYO API key + AI drawer setup | ai/config.ts, ai/client.ts, AiDrawer.svelte, i18n | origin/main only |
| Governing + AutoVerify | Steps A+B: governing-case pipeline + extracted auto-verify | governing-case.ts, auto-verify.ts, results.svelte.ts, live-calc.ts, cirsoc201.ts, cirsoc301.ts, ProPanel.svelte, ProVerificationTab.svelte | origin/main only |
| PRO Report Combos | Step C: combo definitions + governing column in report | pro-report.ts, ProPanel.svelte | Governing + AutoVerify |
| RC Detailing | Step D: detailing rules + visual improvements + Z-up classification fix | cirsoc201.ts, cirsoc201.test.ts, reinforcement-svg.ts, ProVerificationTab.svelte, pro-report.ts, i18n | Governing + AutoVerify |
| Joint + Continuity | Step E: structural graph, joint-aware details, beam continuity | structural-graph.ts, reinforcement-svg.ts, ProVerificationTab.svelte, i18n | RC Detailing |

## Shared Files Requiring Careful Splitting

These files are modified by multiple PRs and need careful cherry-picking:

- **`ProPanel.svelte`**: Bombonera card + auto-verify delegation + report combos
- **`ProVerificationTab.svelte`**: governing labels + detailing UI + joint details + beam continuity + structural graph wiring
- **`cirsoc201.ts`**: governingCombos field + DetailingResult + computeDetailingRules + Z-up classifyElement fix
- **`reinforcement-svg.ts`**: detailing annotations + framing context + joint upgrade + frame-line generator
- **`pro-report.ts`**: combo table + governing column + detailing summary
- **`en.ts` / `es.ts`**: i18n keys from multiple features

## Solver Code Boundary

Product PRs must NOT include changes to:
- `engine/src/**` (Rust solver code)
- `engine/tests/**` (solver test fixtures — except fixture JSON regeneration)
- WASM exports or solver contracts

Upstream solver changes (Z-up fixes, diaphragm fixes) are already merged to `origin/main` and do not need to be in product PRs.

## Open Remote PRs

- **PR #38** (`pr/bombonera-update`): La Bombonera example. Branch still exists on remote. Should be updated or superseded by the restructured Bombonera PR.

## Resume Point After Restructure

After the PR restructure is complete:
1. Read `docs/CURRENT_STATE_STABILEO.md` for the full implementation state
2. The latest product work is through Step E (beam continuity elevations)
3. QA is still needed for beam continuity and joint details
4. Next implementation steps: column continuity, report integration, serviceability exposure, bar mark schedule
5. All work continues in PRO-first scope
