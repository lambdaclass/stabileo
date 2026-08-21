/**
 * Raw colours in the concrete design surface: a debt that can only go down.
 *
 * ── Why a ceiling and not a ban ────────────────────────────────────
 *
 * `design-tokens-resolve.test.ts` already asserts that every `--st-*` a component REFERENCES
 * is defined. It cannot see the opposite problem: a component that writes the colour out by
 * hand instead of referencing the token at all. Those are invisible to it, and there are 132
 * of them in `components/pro/design/`.
 *
 * Most are not arbitrary. `DetailingWorkflow` carried `rgba(143, 163, 179, 0.35)`, which is
 * `--st-hair-strong` (0.38) rewritten by hand, and `rgba(143, 163, 179, 0.2)`, which is
 * `--st-hair` (0.22) rewritten by hand. PR20's own regulations pass found the same thing and
 * said so: "`rgba(143, 163, 179, …)` appeared four times, hardcoded beside the tokens that
 * mean exactly that." A hand-written approximation drifts from the token the day the token
 * changes, and nothing reports it.
 *
 * Banning them outright today would fail on 132 pre-existing sites across eighteen files,
 * several of which are shared surfaces this branch must not touch unilaterally
 * (`DesignToolbar`, `OutcomeBadge`) or belong to the 3-D viewer. So this is a CEILING, the
 * same shape as `scripts/typecheck-baseline.json`: the count is recorded, it may fall, and it
 * may never rise. The debt is visible instead of remembered, and a new component cannot add
 * to it.
 *
 * A file at zero must stay at zero. `DetailingWorkflow` is the first one there.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../../components/pro/design', import.meta.url).pathname;

/**
 * A literal colour: `#rgb`, `#rrggbb`, `rgb(...)`, `rgba(...)`.
 *
 * Comments are stripped first. A comment that NAMES the old value — the one this file's own
 * fix leaves behind, explaining what it replaced — is documentation, not a colour, and
 * counting it would punish writing the reason down.
 */
const COLOUR = /rgba?\(\s*\d|#[0-9a-fA-F]{3,8}\b/g;

function rawColours(source: string): number {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')   // CSS and JS block comments
    .replace(/<!--[\s\S]*?-->/g, '')    // markup comments
    .replace(/^\s*\/\/.*$/gm, '');      // JS line comments
  return (stripped.match(COLOUR) ?? []).length;
}

/**
 * The recorded ceiling, per file. Lower it when you tokenise; never raise it.
 *
 * Bucketed by what this branch may touch, because the numbers are not equally actionable:
 *
 *   concrete-only   H1 can tokenise these whenever it likes
 *   shared PRO      `OutcomeBadge` is referenced by the metallic status badge and
 *                   `DesignToolbar` is the PRO command row — both need coordination
 *   3-D viewer      `RebarWorkspace` / `RebarViewport3D` — the viewer is out of scope here
 */
const CEILING: Record<string, number> = {
  // ── concrete-only ──
  'BatchEditDialog.svelte': 3,
  'ConflictInspector.svelte': 10,
  'DesignFamilyPanel.svelte': 2,
  'FloorFamiliesPanel.svelte': 1,
  'FootingCadHandoffPanel.svelte': 3,
  'FootingMatPanel.svelte': 3,
  'FootingMatPhysicalPanel.svelte': 20,
  'ProvisionalBanner.svelte': 4,
  'RebarScenePanel.svelte': 13,
  'RebarStatusPanel.svelte': 19,
  'SectionAdviceDialog.svelte': 2,
  'SelectionDetails.svelte': 9,
  'TorsionBanner.svelte': 4,
  'VerificationDetail.svelte': 3,
  // ── shared PRO surface: coordinate before lowering ──
  'DesignToolbar.svelte': 12,
  'OutcomeBadge.svelte': 14,
  // ── 3-D viewer: out of scope for this branch ──
  'RebarViewport3D.svelte': 4,
  'RebarWorkspace.svelte': 6,
};

const TOTAL_CEILING = 132;

const files = () => readdirSync(DIR).filter((f) => f.endsWith('.svelte'));

describe('the raw-colour debt does not grow', () => {
  it('no file exceeds its recorded ceiling', () => {
    const over: string[] = [];
    for (const f of files()) {
      const n = rawColours(readFileSync(join(DIR, f), 'utf8'));
      const ceiling = CEILING[f] ?? 0;
      if (n > ceiling) over.push(`${f}: ${n} raw colours, ceiling ${ceiling}`);
    }
    expect(over).toEqual([]);
  });

  it('the total does not exceed the recorded total', () => {
    const total = files()
      .reduce((s, f) => s + rawColours(readFileSync(join(DIR, f), 'utf8')), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CEILING);
  });

  it('a file the ceiling does not list must have none at all', () => {
    // This is the half that bites a NEW component: it is absent from the map, so its ceiling
    // is zero and it has to use tokens from the first line.
    const unlisted = files()
      .filter((f) => !(f in CEILING))
      .map((f) => [f, rawColours(readFileSync(join(DIR, f), 'utf8'))] as const)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f}: ${n}`);
    expect(unlisted).toEqual([]);
  });
});

describe('the detailing panel is tokenised, and stays that way', () => {
  const source = () => readFileSync(join(DIR, 'DetailingWorkflow.svelte'), 'utf8');

  it('has no raw colours left', () => {
    // It had nine, all of them hand-written `rgba(143, 163, 179, α)` — the hair tokens
    // rewritten at slightly different alphas — plus a green and a blue of its own.
    expect(rawColours(source())).toBe(0);
  });

  it('the sheet fieldset matches the convention the other dialogs already used', () => {
    // `ProReportDialog` and `ProAutoLoadsDialog` both use `1px solid var(--st-surface-3)`
    // with the legend in `var(--st-text-2)`. This one had a raw border and an uncoloured
    // legend, which is what made it the odd group out in the panel.
    const s = source();
    expect(s).toMatch(/fieldset\s*\{[^}]*border:\s*1px solid var\(--st-surface-3\)/);
    expect(s).toMatch(/legend\s*\{[^}]*color:\s*var\(--st-text-2\)/);
  });

  it('uses the selection token for the selected assembly, not an approximation', () => {
    // `--st-selected-bg` exists and means exactly this. The file was writing a translucent
    // slate instead, which reads as a hover rather than as a selection.
    expect(source()).toMatch(/\.assemblies button\.selected[^}]*var\(--st-selected-bg\)/);
  });
});
