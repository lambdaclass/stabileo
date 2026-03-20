# Stabileo — Current Implementation State

> Snapshot for resuming after PR restructuring.
> Updated after restack to stacked PR model.

## Working Branch

- **Branch**: `pr/2-pro-rc-deliverable-workflow` (top of the PR stack)
- **Stack**: PR [1] `pr/1-bombonera-fixture` → `main`, PR [2] → PR [1]
- **Based on**: latest `origin/main` (includes repo reorganization, generators removal, Z-up fixes)
- **Build status**: `npm run build` passes
- **Generators.ts**: DELETED on main. Bombonera is fixture-only (no generator needed).

## Source of Truth

The branch `pr/2-pro-rc-deliverable-workflow` is the single source of truth. All product work is committed. The old `feat/a2-ai-access-config` branch is historical and should not be used for new work.

## What Has Been Implemented (Uncommitted)

### AI Access Configuration (A2)
- `web/src/lib/ai/config.ts` — sessionStorage-based runtime API key store
- `web/src/lib/ai/client.ts` — runtime key resolution (user key → deployment key fallback)
- `web/src/components/AiDrawer.svelte` — setup panel, status indicator, availability gate
- i18n keys for AI setup UX (en/es)
- **Status**: committed as `aaaf71b`

### Step A — Governing-Case Envelope Provenance
- `web/src/lib/engine/governing-case.ts` — NEW: `computeGoverning3D()` / `computeGoverning2D()` — identifies which load combination governs each element per force component
- `web/src/lib/store/results.svelte.ts` — `governing3D` / `governing2D` state + getters/setters, cleared on re-solve
- `web/src/lib/engine/live-calc.ts` — computes and stores governing data after combo solve (3D + 2D paths)

### Step B — Auto-Verify + Governing Labels
- `web/src/lib/engine/auto-verify.ts` — NEW: extracted verification utility, attaches governing combo metadata
- `web/src/lib/engine/codes/argentina/cirsoc201.ts` — `governingCombos?` field on `ElementVerification`
- `web/src/lib/engine/codes/argentina/cirsoc301.ts` — `governingCombos?` field on `SteelVerification`
- `web/src/components/pro/ProPanel.svelte` — delegates to `autoVerifyFromResults()`
- `web/src/components/pro/ProVerificationTab.svelte` — shows governing combo labels under Mu/Vu/Nu

### Step C — PRO Report Combo Context
- `web/src/lib/engine/pro-report.ts` — `combinations?` on `ReportData`, load-combinations reference table in model-data section, "Combo" column in verification summary table

### Step D — RC Detailing Outputs
- `web/src/lib/engine/codes/argentina/cirsoc201.ts` — `DetailingResult` interface + `computeDetailingRules()` (ld, ldh, lap splice, min spacing, stirrup hook per CIRSOC 201 Ch. 12), called from `verifyElement()`
- `web/src/components/pro/ProVerificationTab.svelte` — detailing memo section in expanded detail
- `web/src/lib/engine/pro-report.ts` — detailing summary table (bar diameters × ld/ldh/splice)
- i18n keys for detailing labels (en/es): `pro.detailing`, `pro.devLength`, `pro.hookedDev`, `pro.lapSplice`, `pro.minSpacing`, `pro.stirrupHook`, + report equivalents

### Step D Visual — Drawings Reflect Detailing
- `web/src/lib/engine/reinforcement-svg.ts`:
  - Beam elevation: anchorage tails at supports (ld dimensioned), splice zone indicator, framing context column stubs
  - Column elevation: development below foundation (ld dimensioned), splice zone near base, proportional tie hooks, framing context beam stubs
  - `FramingContext` interface + `spliceLabel` parameter for translated labels
  - Fixed beam bar Y-position math (bottom bars now correctly at SVG bottom)
  - Top reinforcement multi-row layout (respects min spacing same as bottom bars)
- `web/src/components/pro/ProVerificationTab.svelte` — passes `detailing`, `context`, `spliceLabel` to all elevation SVG call sites

### Z-up Classification Fix
- `web/src/lib/engine/codes/argentina/cirsoc201.ts` — `classifyElement()` fixed for Z-up: uses `dz > sqrt(dx² + dy²)` instead of the old Y-up logic
- `web/src/lib/engine/__tests__/cirsoc201.test.ts` — tests updated for Z-up convention

### Step E — Joint-Aware Detailing
- `web/src/lib/engine/reinforcement-svg.ts` — `JointDetailSvgOpts` upgraded with `beamDetailing?`, `colDetailing?`, `labels?`, `nodeId?`; hook dimensions from ldh, splice zone in column, translated labels
- `web/src/components/pro/ProVerificationTab.svelte` — joint details derived from actual beam-column connections via structural graph (max 8 unique types), placed at top of Detailing tab

### Step E — Structural Connectivity Graph
- `web/src/lib/engine/structural-graph.ts` — NEW: `buildStructuralGraph()`, `getElementFramingContext()`. Pre-computes node connectivity, beam-column joints, horizontal/vertical frame lines.
- Replaces ad-hoc per-call element scanning in ProVerificationTab

### Step E — Beam Continuity Elevations
- `web/src/lib/engine/reinforcement-svg.ts` — NEW: `generateFrameLineElevationSvg()` — continuous multi-span beam elevation with bottom continuous bars, top support bars, splice zones, column stubs, end anchorage, span dimensions
- `web/src/components/pro/ProVerificationTab.svelte` — `beamFrameLines` derived from structural graph, rendered in Detailing tab between joint details and per-member galleries
- i18n: `pro.beamContinuity` (en/es)

### Bombonera Example
- `web/src/lib/templates/fixtures/la-bombonera.json` — 1005 nodes, 2476 elements, 120 quads
- `web/src/lib/templates/generators.ts` — `generateLaBombonera3D()` generator
- `web/src/lib/templates/fixture-index.ts` — entry added
- `web/src/lib/templates/generate-fixtures.test.ts` — test with correct params
- `web/src/components/pro/ProPanel.svelte` — PRO example card with updated stats
- i18n keys in en/es

## Current Roadmap Position

**RC-first deliverable path, PRO-only.**

Completed through Step E first beam continuity slice. The PRO verification tab now has:
- Governing-case provenance from load combinations
- Auto-verification with extracted utility
- Report with combo definitions + governing combo column
- CIRSOC 201 detailing rules (ld, ldh, splice, spacing, hooks)
- Visual detailing in beam/column elevations
- Joint-aware details derived from model connectivity
- Structural connectivity graph (nodes, joints, frame lines)
- Beam continuity elevations across connected spans

## Pending QA

1. Beam continuity view needs browser QA — verify it renders for multi-span models
2. Joint details should be verified for models with multiple distinct connection types
3. Frame-line tracing may not handle T-intersections or non-orthogonal layouts gracefully

## Known Limitations

- No moment-sign intelligence: bottom bars always shown as main tension (positive moment assumption)
- Frame-line tracing is greedy: T-intersections may split unexpectedly
- Column-stack continuity not yet implemented
- Report does not yet include beam continuity elevations or updated joint details
- No bar marks / cutting lengths / fabrication-grade BBS
- Serviceability checks (crack width, deflection) are computed but not yet shown in UI
- 2D governing data is computed but not consumed by any UI (non-PRO path)

## Next Likely Steps After Resume

1. **Column continuity elevations** — vertical frame-line drawings showing bar flow through floors
2. **Report integration** — add beam continuity + upgraded joints to the PRO report
3. **Serviceability exposure** — render crack/deflection checks already computed
4. **Bar mark schedule** — upgrade from grouped summary to fabrication-oriented marks with cutting lengths
