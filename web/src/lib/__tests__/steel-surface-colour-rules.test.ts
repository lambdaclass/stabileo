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

/**
 * The style block with its comments removed.
 *
 * The literal rules below ban `#rrggbb` from a metallic surface. A comment RECORDING which
 * literals were replaced, and what each was measured at, contains those very strings — so
 * reading the raw block makes a component's own migration notes fail the rule the migration
 * satisfied, and the only way to pass is to delete the reasoning. What the rule is about is what
 * the browser paints.
 */
function declarations(file: string): string {
  return styles(file).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** A component with every kind of comment removed — CSS, block and line. */
function code(file: string): string {
  return read(file)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
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
   * No metallic surface does it, and the list is empty because the one that did is gone.
   *
   * `ProConnectionsTab .conn-ratio-badge.st-fail` — PR21's joints panel — put `--st-accent` on a
   * 20 % vermillion tint: 3.55 over `--st-surface`, 3.41 over `--st-surface-2`. This rule found it,
   * having been written expecting to pass. It was first repainted (`--st-text` on a `--st-danger`
   * border) and then removed outright, once the census showed no template had applied the class
   * since `b71432cd`.
   *
   * An empty list rather than a deleted test: the shape of the defect is what has to stay guarded,
   * and it outlives the one rule that had it.
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

  it('and two of the three concrete instances are fixed, the third is not', () => {
    /*
     * Not a metallic assertion — a cross-check that the report M1 handed H1 is still accurate.
     *
     * The version this replaces asserted the three instances were STILL THERE, and said in its
     * own words: «If H1 fixes them, this fails and the reconciliation document has to be updated,
     * which is the correct outcome: a report nobody notices going stale is worse than no report.»
     *
     * That is what happened. H1's token work reached `main`, merging `main` into M1 brought it,
     * and the test fired exactly as designed. So it is turned around — from reporting a defect to
     * guarding its repair — and `docs/handoffs/m1-token-proposal-reconciliation.md` records the
     * closure.
     */
    const badge = read('components/pro/design/OutcomeBadge.svelte');
    expect(badge, '.badge-fail is back on the brand colour')
      .not.toMatch(/\.badge-fail\s*\{[^}]*var\(--st-accent\)/);
    expect(badge, 'SECTION_INADEQUATE is back on the brand colour')
      .not.toMatch(/\.badge-outcome-SECTION_INADEQUATE\s*\{[^}]*var\(--st-accent\)/);
    // The third is still open. Asserted as such, so the day it is fixed this fires again and the
    // reconciliation gets its final update rather than quietly going stale.
    expect(read('components/pro/design/DesignToolbar.svelte'), '.banner-block was fixed; update the reconciliation')
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
  /**
   * The surfaces still carrying a literal colour, named rather than counted.
   *
   * This used to be the inverse — two files asserted to be clean — which meant every metallic
   * component EXCEPT those two could hardcode a colour and nothing would say so. `SectionFigure`
   * was exactly that: four literals on a component the clean-list did not mention.
   *
   * Enumerated from the directories and inverted, so a surface added later is covered by
   * default and the remaining debt has to be written down to pass. `TopologyPreview` is the one
   * left: nine literals, including the same `#071322` the figure used for its well. It is a
   * separate decision — the two previews sit in the same panel, and moving one without the
   * other is a choice about how they should relate, not a cleanup.
   */
  const LITERALS_REMAIN = ['components/pro/generators/TopologyPreview.svelte'];

  it('leaves a literal colour on exactly the surfaces still owed a migration', () => {
    const offenders = METALLIC.filter((f) => /#[0-9a-f]{3,6}\b/i.test(declarations(f)));
    expect(offenders.sort()).toEqual([...LITERALS_REMAIN].sort());
  });

  it('carries no hardcoded colour in the pickers or the section figure', () => {
    // The state the older surfaces are trying to reach. Asserted so it cannot regress while the
    // migration is happening elsewhere.
    for (const f of [
      'components/pro/steel/GradePickerPanel.svelte',
      'components/pro/generators/ProfileSelectorPanel.svelte',
      'components/pro/generators/SectionFigure.svelte',
    ]) {
      expect(declarations(f), `${f} hardcodes a colour`).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    }
  });

  /**
   * The void and the well are the same token, and that is the property — not the token's name.
   *
   * A void is a hole. Drawn in anything other than exactly the background behind it, it reads as
   * a darker solid, and the figure stops showing which parts of a built-up section are material.
   * Two literals kept equal by hand is how that drifts, so the equality is asserted on the
   * DECLARATIONS: whatever `.fig` paints its background with, `polygon` fills with.
   */
  it('fills a void with the very value the figure is drawn on', () => {
    const css = declarations('components/pro/generators/SectionFigure.svelte');
    const fig = css.match(/\.fig\s*\{[^}]*background:\s*([^;]+);/)?.[1]?.trim();
    const poly = css.match(/polygon\s*\{[^}]*fill:\s*([^;]+);/)?.[1]?.trim();
    expect(fig, '.fig declares a background').toBeTruthy();
    expect(poly, 'polygon declares a fill').toBeTruthy();
    expect(poly).toBe(fig);
    // And it comes from the stylesheet rather than from a presentation attribute — not because
    // `fill="var(…)"` would fail to render (the modal hands this component a `var(--st-value)`
    // stroke and it draws), but because an attribute in the template is not something the
    // assertion above can relate to the rule painting the background it must match.
    expect(code('components/pro/generators/SectionFigure.svelte')).not.toMatch(/fill=\{?['"`]?var\(/);
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

// ─── The joints panel's ratio badges, removed rather than kept legible ─────────────

/**
 * `.conn-ratio-badge` was four rules that nothing applied, and this is what is left of them.
 *
 * The panel used to print the governing demand/capacity ratio as
 * `<span class="conn-ratio-badge {statusClass(...)}">`, in three tinted states. `b71432cd` — the
 * commit that split *Metallic joints* into four `StageSection` sub-sections — moved that number to
 * the shell's own neutral `badge` prop and deleted both spans. The four rules stayed. Two days
 * later `851fd57b` measured their contrast and rewrote all three states, and the tests below
 * asserted the result: an entire commit, and five assertions, about CSS the browser never painted.
 *
 * Nothing caught it because nothing could. Svelte prunes unused selectors and warns, but it stops
 * as soon as a component has a class attribute it cannot read statically — and this one has four
 * (`class="conn-result-card {auxTone(...)}"`). 30 of the repository's 169 styled components are
 * blind the same way, 24 of them under `components/pro/`. `svelte-check` reports what the compiler
 * reports, so the measurement that found "0 diagnostics for ProConnectionsTab" was reading a real
 * silence with a cause upstream of the checker.
 *
 * So the guard is written by hand here, because the compiler will not write it: the rules are gone
 * and the number they used to carry is still on the screen.
 */
describe('the ratio badges are gone, and the ratio is not', () => {
  const CONN = 'components/pro/ProConnectionsTab.svelte';

  it('leaves no rule behind, so a union merge cannot revive them unnoticed', () => {
    // `main` deleted this block in `2c79ed52` ("no green tick for steel"); resolving
    // `ProConnectionsTab.svelte` by keeping both sides is how it came back the first time.
    expect(styles(CONN), '.conn-ratio-badge is back — check the merge resolution')
      .not.toContain('conn-ratio-badge');
  });

  it('still reports the governing ratio, through the sub-section header', () => {
    // The information was never the thing being removed. Both sub-sections hand `StageSection` a
    // percentage, which it renders in its own neutral badge — no state colour, and no verdict.
    const src = read(CONN);
    expect(src).toMatch(/badge=\{boltResult \? `\$\{\(boltResult\.governingRatio \* 100\)/);
    expect(src).toMatch(/badge=\{weldResult \? `\$\{\(weldResult\.ratio \* 100\)/);
  });

  it('and builds no class name that would give one a status hue', () => {
    /*
     * Written as a shape rather than as three strings, because the three strings were never in the
     * file. The spans read `class="conn-ratio-badge {statusClass(...)}"` and `statusClass` was
     * `return \`st-${s}\``, so grepping this component for `st-ok` would have called it clean on
     * the day the badges were on screen — and the same interpolation is why the compiler could not
     * prune the rules either. One defect, two symptoms.
     *
     * So: no helper on this panel turns a status into a class name, and no class attribute carries
     * one written out. A ratio gets no status hue by either route, and the auxiliary block's own
     * vocabulary (`within / near the limit / over the limit`) stays the only thing entitled to
     * comment on it.
     */
    const src = read(CONN);
    expect(src, 'a status-to-class helper is back').not.toMatch(/`st-\$\{/);
    expect(src, 'a status class is written out').not.toMatch(/class="[^"]*\bst-(ok|warn|fail)\b/);
  });

  it('selection still uses --st-accent, which is what that token is for', () => {
    /*
     * Carried over from the removed block. The fix must not become a ban: `--st-accent` is the
     * primary-action and selected colour, and the metallic pickers use it to mark a chip on and a
     * row selected — none of them on a tinted status background. Asserted so a future sweep does
     * not remove the correct use along with the incorrect one.
     */
    const picker = styles('components/pro/generators/ProfileSelectorPanel.svelte');
    expect(picker).toMatch(/\.fam\.on\s*\{[^}]*var\(--st-accent\)/);
    expect(picker).toMatch(/\.row\.sel\s+\.nm\s*\{[^}]*var\(--st-accent\)/);
    const grades = styles('components/pro/steel/GradePickerPanel.svelte');
    expect(grades).toMatch(/\.chip\.on\s*\{[^}]*var\(--st-accent\)/);
  });
});
