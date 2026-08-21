/**
 * The colour rules the metallic surface has to keep, whatever the token contract turns out to be.
 *
 * ── Why this is separate from the contrast file ────────────────────
 *
 * `state-background-contrast.test.ts` is about the PROPOSAL: it computes the numbers behind
 * `--st-danger-bg`, `--st-warn-bg` and the provisional split, and pins the three AA failures that
 * exist today on the concrete side. It will be rewritten when the contract lands.
 *
 * This file is about the metallic surface and is meant to survive that. Three rules, none of which
 * depends on which alpha or which violet is chosen:
 *
 *   1. no metallic surface puts `--st-accent` — the brand vermillion — as text on a tinted error
 *      background. That is the defect the reconciliation found three instances of, all concrete,
 *      and the point of asserting it here is that the metallic side must not acquire a fourth.
 *   2. `SteelStatusBadge` keeps its diagonal hatch. It is not decoration: a status that is
 *      distinguishable without hue is the only one a colour-blind reader can read, and the hatch
 *      is why that badge needs no tinted background and therefore no token from this contract.
 *   3. what M1 added reaches for tokens rather than literals, so the migration has nothing to do
 *      on the newest surfaces.
 *
 * ── What it deliberately does not do ──────────────────────────────
 *
 * It does not assert a token that does not exist yet, and it does not touch `tokens.css` or any
 * shared consumer. H1 owns those. See `m1-token-proposal-reconciliation.md`.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Every component under a directory, so a metallic screen added later is covered by default. */
function walk(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.svelte'))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

/**
 * The metallic surfaces, enumerated from the directories.
 *
 * `ProConnectionsTab` is named explicitly because it lives outside them — the same enumeration
 * `steel-never-verified.test.ts` uses, for the same reason: a hand-kept list stops covering the
 * newest screen.
 */
const METALLIC = [
  ...walk('components/pro/steel'),
  ...walk('components/pro/generators'),
  'components/pro/ProConnectionsTab.svelte',
];

/** The style block of a component, which is the only part these rules are about. */
function styles(file: string): string {
  const src = read(file);
  const at = src.indexOf('<style>');
  return at === -1 ? '' : src.slice(at);
}

/** CSS rules, split crudely on `}` — enough to ask what a single declaration block contains. */
function ruleBlocks(css: string): string[] {
  return css.split('}').map((s) => s.trim()).filter(Boolean);
}

describe('the metallic surfaces are all covered', () => {
  it('enumerates every one of them, including the ones added after this file', () => {
    expect(METALLIC.length).toBeGreaterThanOrEqual(9);
    expect(METALLIC).toContain('components/pro/steel/SteelStatusBadge.svelte');
    expect(METALLIC).toContain('components/pro/steel/GradePickerPanel.svelte');
    expect(METALLIC).toContain('components/pro/generators/ProfileSelectorPanel.svelte');
  });
});

describe('no metallic surface puts the brand colour on an error background', () => {
  /**
   * The rule: `--st-accent` is the brand vermillion and `--st-danger` is the status red. Four rules
   * across the app reach for the first on a tinted background — 3.86, 3.93 and 3.51 on the
   * concrete side, 3.55 on the metallic one — and all four are under AA.
   *
   * Checked per declaration block: a block that sets both a reddish tinted background AND
   * `color: var(--st-accent)` is the shape of the defect.
   */
  const REDDISH = /background[^;]*rgba\(\s*(2[0-5]\d|1[89]\d)\s*,\s*([0-9]|[1-9]\d)\s*,\s*([0-9]|[1-9]\d)\s*,/;

  /**
   * No metallic surface does it, and the list is empty because the one that did was fixed.
   *
   * `ProConnectionsTab .conn-ratio-badge.st-fail` — PR21's joints panel — put `--st-accent` on a
   * 20 % vermillion tint: 3.55 over `--st-surface`, 3.41 over `--st-surface-2`. This rule found it,
   * having been written expecting to pass. It now carries `--st-text` (13.09 / 12.58) with a
   * `--st-danger` border, which is the pattern H1's own migration settled on for a danger surface.
   *
   * An empty list rather than a deleted test: the shape of the defect is what has to stay guarded.
   */
  const KNOWN_METALLIC: string[] = [];

  it('has no instance at all, on any metallic surface', () => {
    const found: string[] = [];
    for (const file of METALLIC) {
      for (const block of ruleBlocks(styles(file))) {
        if (!REDDISH.test(block)) continue;
        if (/color:\s*var\(--st-accent\)/.test(block)) found.push(`${file}: ${block.slice(0, 70)}`);
      }
    }
    expect(found, `accent text on a red tint:\n${found.join('\n')}`).toEqual(KNOWN_METALLIC);
  });

  it('allows --st-accent where it means selection, which is what it is for', () => {
    /*
     * A first draft of this file banned `--st-accent` as text on any metallic surface. That was
     * overreach: the token IS the primary action and the brand, and the pickers use it correctly to
     * mark a chip as on, a row as selected and a pin as active — the same job `--st-selected`
     * names, with the same value.
     *
     * So the rule is about a tinted STATUS background, not about the token. This asserts the
     * legitimate uses stay legitimate rather than being swept up by a broader ban.
     */
    const picker = styles('components/pro/generators/ProfileSelectorPanel.svelte');
    expect(picker).toMatch(/\.fam\.on\s*\{[^}]*var\(--st-accent\)/);
    expect(picker).toMatch(/\.row\.sel\s+\.nm\s*\{[^}]*var\(--st-accent\)/);
    // And none of those blocks carries a tinted status background, which is what makes them fine.
    for (const block of ruleBlocks(picker)) {
      if (!/var\(--st-accent\)/.test(block)) continue;
      expect(REDDISH.test(block), `selection block also tints a status background: ${block.slice(0, 60)}`)
        .toBe(false);
    }
  });

  it('and the three concrete instances are still where the reconciliation says they are', () => {
    /*
     * Not a metallic assertion — a cross-check that the report M1 handed H1 is still accurate. If
     * H1 fixes them, this fails and the reconciliation document has to be updated, which is the
     * correct outcome: a report nobody notices going stale is worse than no report.
     */
    const badge = read('components/pro/design/OutcomeBadge.svelte');
    expect(badge).toMatch(/\.badge-fail\s*\{[^}]*var\(--st-accent\)/);
    expect(badge).toMatch(/\.badge-outcome-SECTION_INADEQUATE\s*\{[^}]*var\(--st-accent\)/);
    expect(read('components/pro/design/DesignToolbar.svelte'))
      .toMatch(/\.banner-block\s*\{[^}]*var\(--st-accent\)/);
  });
});

describe('SteelStatusBadge keeps the hatch that makes it readable without hue', () => {
  const badge = () => read('components/pro/steel/SteelStatusBadge.svelte');

  it('draws its warn tone as a diagonal pattern, not as a flat tint', () => {
    // The reason this badge needs no background token: the pattern IS the signal. A flat tint
    // would make it one more consumer of `--st-warn-bg` and would lose the hue-independence.
    const css = styles('components/pro/steel/SteelStatusBadge.svelte');
    expect(css).toContain('repeating-linear-gradient');
    expect(css).toMatch(/45deg/);
  });

  it('pairs the pattern with the warn colour and border, so it is not pattern alone', () => {
    const css = styles('components/pro/steel/SteelStatusBadge.svelte');
    const warnBlock = ruleBlocks(css).find((b) => b.includes('repeating-linear-gradient'));
    expect(warnBlock, 'the hatch block exists').toBeTruthy();
    expect(warnBlock!).toMatch(/var\(--st-warn\)/);
  });

  it('never shows a passing tone, and every state carries a word as well as a glyph', () => {
    // The two rules `steel-never-verified.test.ts` owns, re-asserted here because this file is
    // about this component's appearance and those are part of it.
    const src = badge();
    expect(src).not.toMatch(/\.tone-ok\b/);
    expect(src).not.toMatch(/tone-(pass|success|verified)\b/);
    expect(src).toContain('sr-only');
    expect(src).toContain('aria-hidden="true"');
  });

  it('has no tinted danger or warn background for the contract to migrate', () => {
    /*
     * The correction M1 owes H1's inventory. Their table says this component "inherits without
     * being edited" because it "references OutcomeBadge" — it does not: it imports only `i18n` and
     * `steel-status` and defines its own four tone classes. The conclusion is right for a
     * different reason, and this is that reason.
     */
    const src = badge();
    expect(src).not.toContain('OutcomeBadge.svelte');
    expect(src).not.toMatch(/import[^;]*OutcomeBadge/);
    const css = styles('components/pro/steel/SteelStatusBadge.svelte');
    // No flat red or amber fill: the only tinted things are the hatch and two neutral washes.
    expect(css).not.toMatch(/background:\s*rgba\(\s*2[0-5]\d\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}\s*,/);
  });
});

describe('what M1 added needs nothing from the contract', () => {
  it('carries no hardcoded colour in the two pickers', () => {
    // The state the older surfaces are trying to reach. Asserted so it cannot regress while the
    // migration is happening elsewhere.
    for (const f of [
      'components/pro/steel/GradePickerPanel.svelte',
      'components/pro/generators/ProfileSelectorPanel.svelte',
    ]) {
      expect(styles(f), `${f} hardcodes a colour`).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });

  it('lists the metallic consumers the new tokens would and would not reach', () => {
    /*
     * The inventory the reconciliation reports, asserted rather than written down: of the metallic
     * surfaces, only `ProConnectionsTab` carries tinted warn backgrounds, and they are M1's own
     * from PR21 — two of them, at 0.10 and 0.08.
     *
     * If a metallic surface acquires a third, this fails and the inventory gets updated instead of
     * quietly going stale.
     */
    const withTintedWarn = METALLIC.filter((f) =>
      /background:\s*rgba\(\s*221\s*,\s*170\s*,\s*0\s*,/.test(styles(f))
      && !styles(f).includes('repeating-linear-gradient'));
    expect(withTintedWarn).toEqual(['components/pro/ProConnectionsTab.svelte']);

    const hatched = METALLIC.filter((f) => styles(f).includes('repeating-linear-gradient'));
    expect(hatched.sort()).toEqual([
      'components/pro/steel/SteelExperimentalBanner.svelte',
      'components/pro/steel/SteelPanel.svelte',
      'components/pro/steel/SteelStatusBadge.svelte',
    ]);
  });
});

// ─── The joints panel's three ratio badges, one rule each ─────────────

/**
 * The five distinctions a status badge has to keep, on the one metallic component that has a set
 * of them.
 *
 * `.conn-ratio-badge` reports the governing demand/capacity ratio of a bolt group or a weld, in
 * three states. Each is a tinted fill with a label on it — the case the shared token contract
 * calls "the fill IS the signal", because a 0.62rem badge has no room for a rule beside it.
 *
 * What is asserted is not the colours. It is that each state names its own role, that the failing
 * one is legible, that selection is left alone, and that every label clears 4.5:1 on both grounds
 * the panel sits on. The arithmetic is the same as `state-background-contrast.test.ts`'s and is
 * repeated rather than imported so this file stands on its own if that one is rewritten when the
 * contract lands here.
 */
describe('the ratio badges: fail, warn, ok, selection, and the floor', () => {
  const CONN = 'components/pro/ProConnectionsTab.svelte';
  const css = () => styles(CONN);

  // Same WCAG arithmetic, composited before measuring.
  const chan = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const over = (tint: [number, number, number], alpha: number, bg: string) => {
    const b = [0, 2, 4].map((i) => parseInt(bg.replace('#', '').slice(i, i + 2), 16));
    const mix = tint.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
    return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };

  const GROUNDS = { surface: '#0f1e2b', 'surface-2': '#13212d' } as const;
  const TEXT = { ok: '#2aa869', warn: '#d9a441', danger: '#e8705f', text: '#f4f7fa' } as const;

  /** Pull one badge rule out of the stylesheet. */
  function rule(state: 'ok' | 'warn' | 'fail'): string {
    const block = ruleBlocks(css()).find((b) => b.includes(`.conn-ratio-badge.st-${state}`));
    expect(block, `.st-${state} rule exists`).toBeTruthy();
    return block!;
  }

  it('1 — a FAILING ratio is legible on its tinted background', () => {
    const block = rule('fail');
    // The brand colour is gone; the text is neutral and the role moved to the border.
    expect(block).not.toMatch(/color:\s*var\(--st-accent\)/);
    expect(block).toMatch(/color:\s*var\(--st-text\)/);
    expect(block).toMatch(/border-color:\s*var\(--st-danger\)/);

    for (const [name, ground] of Object.entries(GROUNDS)) {
      const bg = over([229, 72, 42], 0.2, ground);
      const r = ratio(TEXT.text, bg);
      expect(r, `fail label on ${name}: ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      // And the border clears the 3:1 WCAG 2.1 §1.4.11 asks of a non-text boundary.
      expect(ratio(TEXT.danger, bg), `fail border on ${name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('2 — a WARNING ratio names its role on the border, and its label clears the floor', () => {
    const block = rule('warn');
    expect(block).toMatch(/color:\s*var\(--st-text\)/);
    expect(block).toMatch(/border-color:\s*var\(--st-warn\)/);
    for (const [name, ground] of Object.entries(GROUNDS)) {
      const bg = over([217, 164, 65], 0.2, ground);
      expect(ratio(TEXT.text, bg), `warn label on ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(TEXT.warn, bg), `warn border on ${name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('3 — a CORRECT ratio does the same, which is what this rule found second', () => {
    /*
     * `.st-ok` was the second failure in this component and it was found by this very assertion:
     * `--st-ok` on its own 20 % green tint is 3.75 over `--st-surface` and 3.64 over
     * `--st-surface-2`. Amber was the only one of the three that passed, which matches the
     * palette-wide finding that amber is the bright exception among the plain hues.
     */
    const block = rule('ok');
    expect(block).toMatch(/color:\s*var\(--st-text\)/);
    expect(block).toMatch(/border-color:\s*var\(--st-ok\)/);
    for (const [name, ground] of Object.entries(GROUNDS)) {
      const bg = over([34, 204, 102], 0.2, ground);
      expect(ratio(TEXT.text, bg), `ok label on ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(TEXT.ok, bg), `ok border on ${name}`).toBeGreaterThanOrEqual(3);
      // The value that used to be here, recorded so the regression is recognisable.
      expect(ratio(TEXT.ok, bg), `the old ok label on ${name}`).toBeLessThan(4.5);
    }
  });

  it('applies one pattern to all three, so no state looks meaningfully different', () => {
    // Leaving `.st-warn` as the only badge whose label carried the hue would make the difference
    // between states look like it meant something it does not.
    for (const state of ['ok', 'warn', 'fail'] as const) {
      expect(rule(state), `.st-${state} label`).toMatch(/color:\s*var\(--st-text\)/);
      expect(rule(state), `.st-${state} border`).toMatch(/border-color:\s*var\(--st-(ok|warn|danger)\)/);
    }
  });

  it('4 — the three states are the same size, so a change of status does not shift the row', () => {
    // The border is reserved transparent on the base class. Colouring only the failing one
    // without reserving it would make that badge 2 px larger than its siblings.
    const base = ruleBlocks(css()).find((b) => /\.conn-ratio-badge\s*\{/.test(b));
    expect(base).toMatch(/border:\s*1px solid transparent/);
  });

  it('5 — selection still uses --st-accent, which is what that token is for', () => {
    /*
     * The fix must not become a ban. `--st-accent` is the primary-action and selected colour, and
     * the metallic pickers use it to mark a chip on and a row selected — none of them on a tinted
     * status background. Asserted so a future sweep does not remove the correct use along with the
     * incorrect one.
     */
    const picker = styles('components/pro/generators/ProfileSelectorPanel.svelte');
    expect(picker).toMatch(/\.fam\.on\s*\{[^}]*var\(--st-accent\)/);
    expect(picker).toMatch(/\.row\.sel\s+\.nm\s*\{[^}]*var\(--st-accent\)/);
    const grades = styles('components/pro/steel/GradePickerPanel.svelte');
    expect(grades).toMatch(/\.chip\.on\s*\{[^}]*var\(--st-accent\)/);
  });

  it('leaves the tint a literal until the contract reaches this branch', () => {
    /*
     * `--st-danger-bg` exists in H1's `dfa20d8b` and not here. Referencing it now would be an
     * undefined custom property — which draws nothing, silently, and is exactly what
     * `design-tokens-resolve.test.ts` was written to catch. So the tint stays written out, and
     * migrating it is one line in the commit that adopts the contract.
     */
    expect(read('styles/tokens.css'), 'the contract has arrived — migrate the tint')
      .not.toContain('--st-danger-bg');
    expect(rule('fail')).toMatch(/rgba\(\s*229\s*,\s*72\s*,\s*42\s*,\s*0?\.2/);
  });
});
