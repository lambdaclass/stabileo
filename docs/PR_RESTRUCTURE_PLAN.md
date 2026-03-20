# Stabileo — PR Stack Structure

> Final stack after restructuring.

## Active PR Stack

| PR | Branch | Targets | Title | Status |
|----|--------|---------|-------|--------|
| [1] | `pr/1-bombonera-fixture` | `main` | [1] Add La Bombonera 1005-node stadium example | Ready |
| [2] | `pr/2-pro-rc-deliverable-workflow` | PR [1] | [2] PRO RC deliverable workflow | Ready |

## Working Branch

**`pr/2-pro-rc-deliverable-workflow`** is the top of the stack and the active working branch.

## What Each PR Contains

### [1] La Bombonera Fixture
- `web/src/lib/templates/fixtures/la-bombonera.json` (1005 nodes, 2476 elements)
- `web/src/lib/templates/fixture-index.ts` (entry added)
- `web/src/components/pro/ProPanel.svelte` (example card)
- `web/src/lib/i18n/locales/en.ts`, `es.ts` (3 keys each)

### [2] PRO RC Deliverable Workflow
Full PRO RC engineering pipeline (Steps A through E):
- Governing-case post-processing
- Auto-verify extracted utility
- PRO report combo definitions + governing column
- CIRSOC 201 detailing rules (ld, ldh, splice, spacing, hooks)
- Visual detailing annotations in beam/column elevations
- Z-up classifyElement fix
- Structural connectivity graph
- Joint-aware detailing from model connections
- Beam frame-line continuity elevations

## Superseded / Dropped

| Old Branch/PR | Reason |
|---------------|--------|
| `pr/1-engine` through `pr/8-landing-fix` | All merged to main long ago |
| `pr/fresh-all-web` | Staging branch, content in main |
| `pr/pro-verification-qa` | Content rebased into PR [2] |
| `pr/showcase-examples` | Bombonera in PR [1]; rest in main |
| `pr/bombonera-update` (PR #38) | Superseded by PR [1] (fixture-only) |
| `feat/a2-ai-access-config` | Historical; replaced by PR [2] as working branch |
| All other `feat/*`, `fix/*`, `local/*`, etc. | Historical, superseded |

## Solver Code Boundary

Product PRs do NOT touch `engine/**` Rust/WASM code.

## Resume Point

Read `docs/CURRENT_STATE_STABILEO.md` for full implementation state. Top of stack: `pr/2-pro-rc-deliverable-workflow`.
