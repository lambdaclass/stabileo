# Stabileo — PR Stack Structure

## Active PR Stack

| PR | Branch | Targets | Title |
|----|--------|---------|-------|
| [1] | `pr/1-bombonera-fixture` | `main` | [1] Add La Bombonera 1005-node stadium example |
| [2] | `pr/2-pro-governing-pipeline` | PR [1] | [2] PRO RC deliverable workflow |

## Working Branch

`pr/2-pro-governing-pipeline` is the top of the stack.

## Why 2 PRs Instead of 4

The product files (cirsoc201.ts, ProVerificationTab.svelte, reinforcement-svg.ts, etc.) have deeply interleaved changes across Steps A-E. Splitting them into 4 PRs would require artificial intermediate file states that never existed and wouldn't build independently. The honest structure is 2 PRs: one clean independent example (Bombonera), one coherent product workflow (all RC deliverable steps).

## Superseded

- PR #38, #39, #40 on GitHub — superseded by new branches
- All old `pr/1-engine` through `pr/8-landing-fix` — in main
- `feat/a2-ai-access-config` — historical, replaced by stack

## Authorship

All commits authored by Bauti only. No co-author trailers.
