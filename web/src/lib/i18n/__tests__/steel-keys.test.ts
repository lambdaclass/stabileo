/**
 * Every metallic key the source asks for exists, in both shipped dictionaries.
 *
 * ── Why this is worth a test ───────────────────────────────────────
 *
 * `t()` returns the KEY when it cannot find a translation. So a typo does not throw, it
 * renders `steel.status.NOT_DESGINED` into the panel, and the only thing that catches it is
 * somebody looking. This namespace is built from string templates in four modules, which is
 * exactly the shape that produces those typos.
 *
 * ── And why the surface is asserted from its source ────────────────
 *
 * There is no component-test harness in this repository. The two properties below that
 * matter most — that nothing metallic can be shown with a passing treatment, and that the
 * warning cannot be conditioned away — are structural, so they are asserted against the
 * component source. Crude, and it does catch the regression it is aimed at: a later edit
 * that wraps the banner in an `{#if}` or adds a green tone fails here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import steelEs from '../locales/steel/es';
import steelEn from '../locales/steel/en';
import steelPt from '../locales/steel/pt';

const SRC = join(import.meta.dirname, '../../..');

function read(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|svelte)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Literal `steel.*` / `generator.*` keys mentioned anywhere in the source. */
function literalKeys(): Set<string> {
  const found = new Set<string>();
  const files = [
    ...walk('lib/engine/steel'),
    ...walk('lib/engine/generators'),
    // The catalogue layers emit note keys of their own — an unavailable property, or a pairing
    // verdict, has to say why.
    ...walk('lib/profiles'),
    ...walk('lib/grades'),
    'lib/engine/design/adapters/cirsoc301-capabilities.ts',
    ...walk('components/pro/steel'),
    ...walk('components/pro/generators'),
    'lib/store/steel.svelte.ts',
    'lib/engine/design/member-context.ts',
  ];
  for (const f of files) {
    if (f.includes('__tests__')) continue;
    for (const m of read(f).matchAll(/'((?:steel|generator)\.[A-Za-z0-9_.]+)'/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

describe('steel and generator translation keys', () => {
  it('ships the same key set in Spanish, English and Portuguese', () => {
    // Portuguese was checked by nothing. It is one of the three languages the metallic surface
    // is offered in, and a key missing from it renders as the key itself for a Brazilian user
    // — the same failure the other two are guarded against, unguarded.
    const es = Object.keys(steelEs).sort();
    expect(Object.keys(steelEn).sort()).toEqual(es);
    expect(Object.keys(steelPt).sort()).toEqual(es);
  });

  it('translates every key it ships, in both languages', () => {
    for (const [k, v] of Object.entries(steelEs)) {
      expect(v.trim().length, `es ${k} is empty`).toBeGreaterThan(0);
      expect(v, `es ${k} was left as its own key`).not.toBe(k);
    }
    for (const [k, v] of Object.entries(steelEn)) {
      expect(v.trim().length, `en ${k} is empty`).toBeGreaterThan(0);
      expect(v, `en ${k} was left as its own key`).not.toBe(k);
    }
    for (const [k, v] of Object.entries(steelPt)) {
      expect(v.trim().length, `pt ${k} is empty`).toBeGreaterThan(0);
      expect(v, `pt ${k} was left as its own key`).not.toBe(k);
    }
  });

  it('has a translation for every literal key the source asks for', () => {
    const missing = [...literalKeys()].filter((k) => !(k in steelEs)).sort();
    expect(missing, `keys used in source but not translated:\n${missing.join('\n')}`).toEqual([]);
  });

  /**
   * The template-built keys, enumerated from the same lists the source builds them from.
   *
   * `t(\`steel.status.${status}\`)` cannot be found by a regex, so the enumerations are
   * imported and expanded here — which also means a value added to one of those unions
   * fails this test until it is translated.
   */
  it('has a translation for every key built from a template', async () => {
    const { STEEL_MEMBER_STATUSES } = await import('../../engine/steel/steel-status');
    const { STEEL_EMPTY_REASONS } = await import('../../engine/steel/steel-inventory');
    const { MEMBER_ROLES } = await import('../../engine/generators/member-roles');
    const { STRUCTURAL_MATERIAL_FAMILIES } = await import('../../engine/steel/material-family');
    const { STEEL_CAPABILITY_KEYS } = await import('../../engine/design/adapters/cirsoc301-capabilities');
    const { BUILT_UP_ARRANGEMENTS, BUILT_UP_TORSION_BASES } = await import('../../engine/generators/built-up-section');
    const { OUTLINE_UNAVAILABLE_REASONS } = await import('../../engine/generators/section-outline');
    const { TRUSS_KINDS, ARCH_CURVES, WEB_PATTERNS } = await import('../../engine/generators/truss-topology');
    const { LACING_PATTERNS } = await import('../../engine/generators/lattice-column');
    const { PROPERTY_ORDER, PROPERTY_BASES } = await import('../../profiles/properties');
    const { GRADE_PROPERTY_ORDER, GRADE_BASES, GRADE_FAMILIES, populatedRegions } =
      await import('../../grades/catalogue');

    const expected = [
      ...STEEL_MEMBER_STATUSES.map((s) => `steel.status.${s}`),
      ...STEEL_MEMBER_STATUSES.map((s) => `steel.status.${s}.desc`),
      ...MEMBER_ROLES.map((r) => `generator.role.${r}`),
      ...STRUCTURAL_MATERIAL_FAMILIES.map((f) => `steel.family.${f}`),
      ...STEEL_CAPABILITY_KEYS.map((k) => `steel.capability.${k}`),
      'steel.kind.beam', 'steel.kind.column', 'steel.kind.wall',
      // Expanded from the union rather than listed: the three that were listed by hand are
      // now four, and the fourth would have shipped untranslated.
      ...STEEL_EMPTY_REASONS.map((r) => `steel.panel.empty.${r}`),
      // Everything the generators panel builds from an enumeration. A value added to any of
      // these unions fails here until it is translated, which is the point.
      ...BUILT_UP_ARRANGEMENTS.map((a) => `generator.arrangement.${a}`),
      ...TRUSS_KINDS.map((k) => `generator.truss.${k}`),
      ...ARCH_CURVES.map((c) => `generator.archCurve.${c}`),
      ...WEB_PATTERNS.map((w) => `generator.webPattern.${w}`),
      ...LACING_PATTERNS.map((l) => `generator.lacing.${l}`),
      // Built from templates by `torsionBasisKey` and `outlineUnavailableKey`, so a regex over
      // the source cannot see them — which is exactly how one of these would ship rendering
      // its own key.
      ...BUILT_UP_TORSION_BASES.map((b) => `generator.builtUp.torsion.${b}`),
      ...OUTLINE_UNAVAILABLE_REASONS.map((u) => `generator.outline.${u}`),
      // The section card's rows and the badge that says where each number came from. Both are
      // built from a template, so both would otherwise ship as their own keys.
      ...PROPERTY_ORDER.map((k) => `steel.props.label.${k}`),
      ...PROPERTY_BASES.map((b) => `steel.props.basis.${b}`),
      ...PROPERTY_BASES.map((b) => `steel.props.basis.title.${b}`),
      // The grade card, its authority badges, and the two axes its chips are built from.
      ...GRADE_PROPERTY_ORDER.map((k) => `steel.grades.label.${k}`),
      ...GRADE_BASES.map((b) => `steel.grades.basis.${b}`),
      ...GRADE_BASES.map((b) => `steel.grades.basis.title.${b}`),
      ...GRADE_FAMILIES.map((f) => `steel.grades.family.${f}`),
      ...populatedRegions().map((r) => `steel.grades.region.${r}`),
    ];
    const missing = expected.filter((k) => !(k in steelEs)).sort();
    expect(missing, `template keys not translated:\n${missing.join('\n')}`).toEqual([]);
  });

  it('reaches the app through the shipped dictionaries, not only the module', async () => {
    const { dictFor } = await import('../store.svelte');
    for (const locale of ['es', 'en', 'pt']) {
      const d = dictFor(locale);
      expect(d['steel.panel.title'], locale).toBeTruthy();
      expect(d['generator.role.chord'], locale).toBeTruthy();
      expect(d['regulations.problem.experimentalAdapter'], locale).toBeTruthy();
    }
  });
});

describe('the metallic surface cannot show a pass', () => {
  const badge = read('components/pro/steel/SteelStatusBadge.svelte');

  it('has no passing tone to show', () => {
    // `steelDisplayTone` cannot return one; this checks the component has no class for one
    // either, so a status added later cannot pick up a green look by accident.
    expect(badge).not.toMatch(/\.tone-ok\b/);
    expect(badge).not.toMatch(/tone-(pass|success|verified)\b/);
  });

  it('always emits the label as text as well as a glyph', () => {
    expect(badge).toContain('sr-only');
    expect(badge).toContain('aria-hidden="true"');
    // The glyph is aria-hidden, so the accessible name has to come from the sr-only span.
    expect(badge).toMatch(/class="sr-only">\{label\}/);
  });
});

describe('the experimental warnings cannot be conditioned away', () => {
  it('the panel banner is unconditional', () => {
    const panel = read('components/pro/steel/SteelPanel.svelte');
    const bannerAt = panel.indexOf('data-testid="steel-experimental-banner"');
    expect(bannerAt).toBeGreaterThan(0);
    // Nothing between the opening of the markup and the banner may be a conditional block.
    const markupStart = panel.indexOf('<div class="steel-panel"');
    expect(markupStart).toBeGreaterThan(0);
    expect(panel.slice(markupStart, bannerAt)).not.toContain('{#if');
  });

  it('the checker banner lists the assumptions it is warning about', async () => {
    const { CIRSOC301_JS_ASSUMPTIONS } = await import('../../engine/design/adapters/cirsoc301-capabilities');
    expect(CIRSOC301_JS_ASSUMPTIONS.length).toBeGreaterThan(0);
    for (const key of CIRSOC301_JS_ASSUMPTIONS) expect(steelEs[key]).toBeTruthy();
    const banner = read('components/pro/steel/SteelExperimentalBanner.svelte');
    expect(banner).toContain('CIRSOC301_JS_ASSUMPTIONS');
  });

  it('sits above the CIRSOC 301 table rather than below it', () => {
    const tab = read('components/pro/ProVerificationTab.svelte');
    const banner = tab.indexOf('<SteelExperimentalBanner />');
    const table = tab.indexOf('{#each steelVerifications as sv}');
    expect(banner).toBeGreaterThan(0);
    expect(table).toBeGreaterThan(0);
    expect(banner).toBeLessThan(table);
  });
});
