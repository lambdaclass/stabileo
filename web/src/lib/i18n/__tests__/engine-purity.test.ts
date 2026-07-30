/**
 * The gates that keep engine output translatable.
 *
 * The PR16 audit found Spanish sentences hardcoded inside pure modules: a Spanish-speaking
 * developer's defaults leaking into an app that ships fourteen locales. Fixing the strings
 * once is easy; keeping them fixed needs a test, because the natural way to add a new
 * warning is to type it.
 *
 * Four gates:
 *
 *   1. PURITY      — no module under lib/codes/ or lib/engine/loads/ imports the i18n store.
 *   2. NO PROSE    — no long user-facing literal survives in those modules.
 *   3. PARITY      — every key an engine can emit exists in en AND es, with the same
 *                    placeholders, and no locale has duplicate keys.
 *   4. NO BARE KEY — rendering every engine key in every locale never returns the key
 *                    itself, which is what `t()` does when a translation is missing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dictFor, shippedLocales, tAt } from '../store.svelte';
import { OCCUPANCY_TABLE_2025 } from '../../codes/cirsoc101/live-loads';
import { REGULATION_ROLES, optionsForRole } from '../../codes/roles';

const SRC = new URL('../../..', import.meta.url).pathname;

/** Directories that must stay free of i18n imports and of prose. */
const PURE_DIRS = ['lib/codes', 'lib/engine/loads'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // Test files may hold prose: asserting on rendered text is the point of them.
      if (name === '__tests__') continue;
      out.push(...walk(full));
    } else if (name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const pureFiles = PURE_DIRS.flatMap((d) => walk(join(SRC, d)));

/**
 * Strip everything that is legitimately not a translatable string.
 *
 * Three exemptions, each narrow and each justified:
 *
 *   - Comments. Obviously.
 *   - `clause(...)` annotation arguments — never rendered, see `ClauseRef.label`.
 *   - The `REGULATIONS` registry's `title`, `instrument` and `published` fields. These are
 *     the official titles of Argentine legal instruments ("Reglamento Argentino de
 *     Estructuras de Hormigón", "Boletín Oficial de la República Argentina"). Translating
 *     the name of a law misidentifies it; a citation has to read as the thing being cited.
 *     The regulation's *short name* is separately keyed and localisable.
 *   - Messages inside `throw new Error(...)`, which are for developers reading a stack
 *     trace, not users.
 */
function strippedSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    // Tolerant of non-literal arguments: `clause('cirsoc-201', edition, 'Tabla 25.3.1', …)`
    // passes the edition as a variable, which a literals-only pattern would miss.
    .replace(/clause\((?:[^()']|'(?:[^'\\]|\\.)*')*\)/g, 'clause()')
    .replace(/^\s*(?:title|instrument|published):\s*'(?:[^'\\]|\\.)*',?$/gm, '')
    .replace(/throw new Error\(\s*(?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)(?:\s*\+\s*(?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`))*\s*,?\s*\)/g, 'throw new Error()');
}

describe('engine purity — pure modules never reach the i18n store', () => {
  it('finds the modules it is supposed to be guarding', () => {
    // A gate that silently guards nothing is worse than no gate.
    expect(pureFiles.length).toBeGreaterThan(10);
  });

  it('never imports from lib/i18n', () => {
    const offenders: string[] = [];
    for (const file of pureFiles) {
      const src = readFileSync(file, 'utf8');
      if (/from\s+'[^']*i18n[^']*'/.test(src)) offenders.push(relative(SRC, file));
    }
    expect(offenders, 'pure modules must return { key, params }, not translated text')
      .toEqual([]);
  });

  it('holds no long user-facing prose literal', () => {
    // 45 characters is past any identifier, unit, clause number or CSS class and well into
    // sentence territory. Accents are the other tell: an engine has no business typing "ó".
    const offenders: Array<{ file: string; text: string }> = [];
    for (const file of pureFiles) {
      const src = strippedSource(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/'((?:[^'\\\n]|\\.){45,})'/g)) {
        const text = m[1];
        if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text) || /\s\w+\s\w+\s\w+\s/.test(text)) {
          offenders.push({ file: relative(SRC, file), text: text.slice(0, 70) });
        }
      }
    }
    expect(offenders, 'move this text to the locale files and emit msg(key, params)')
      .toEqual([]);
  });
});

// ─── Key inventory ───────────────────────────────────────────────

/** Every key any engine can emit, harvested from the sources. */
function engineKeys(): string[] {
  const keys = new Set<string>();
  for (const file of pureFiles) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/msg\(\s*'([\w.]+)'/g)) keys.add(m[1]);
    // Keys carried as plain fields: labelKey, noteKey, explanationKey, nameKey.
    for (const m of src.matchAll(/(?:labelKey|noteKey|nameKey|explanationKey):\s*'([\w.]+)'/g)) {
      keys.add(m[1]);
    }
    // Template-built keys such as `loads.occupancy.${key}` cannot be harvested this way;
    // they are covered by the table-driven test below.
    for (const m of src.matchAll(/key:\s*'((?:loadPlan|regulations|revisions|codes|loads|maturity)\.[\w.]+)'/g)) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

const REQUIRED_LOCALES = ['en', 'es'];

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe('locale parity for engine keys', () => {
  const keys = engineKeys();

  it('harvested a meaningful number of keys', () => {
    expect(keys.length).toBeGreaterThan(40);
  });

  it('defines every engine key in English and Spanish', () => {
    const missing: string[] = [];
    for (const locale of REQUIRED_LOCALES) {
      const dict = dictFor(locale);
      for (const k of keys) if (dict[k] === undefined) missing.push(`${locale}: ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('uses the same placeholders in every locale that defines the key', () => {
    // A translation that drops {edition} reintroduces the duplicate-label defect; one that
    // invents {level} renders a literal brace to the user.
    const mismatched: string[] = [];
    for (const k of keys) {
      const reference = placeholders(dictFor('en')[k] ?? '');
      for (const locale of shippedLocales()) {
        const text = dictFor(locale)[k];
        if (text === undefined) continue;
        const got = placeholders(text);
        if (got.join(',') !== reference.join(',')) {
          mismatched.push(`${k} [${locale}]: {${got}} vs en {${reference}}`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('never renders an engine key as its own text', () => {
    // `t()` returns the key when a translation is missing — that is how `maturity.validated`
    // once appeared in a badge. This catches it for every key in every shipped locale.
    const bare: string[] = [];
    for (const locale of shippedLocales()) {
      for (const k of keys) {
        if (tAt(k, locale) === k) bare.push(`${locale}: ${k}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('has no duplicate key in any locale file', () => {
    // Two entries for one key is a silent overwrite: the later wins and the earlier
    // translation is dead text nobody notices.
    const dups: string[] = [];
    for (const locale of shippedLocales()) {
      const src = readFileSync(join(SRC, `lib/i18n/locales/${locale}.ts`), 'utf8');
      const seen = new Set<string>();
      for (const m of src.matchAll(/^\s*'([\w.]+)':/gm)) {
        if (seen.has(m[1])) dups.push(`${locale}: ${m[1]}`);
        seen.add(m[1]);
      }
    }
    expect(dups).toEqual([]);
  });
});

// ─── Table-driven keys the source harvester cannot see ───────────

describe('keys built from data rather than written out', () => {
  it('translates every Table 4.1 occupancy row in English and Spanish', () => {
    // `labelKey` is built as `loads.occupancy.${key}`, so a new table row ships with a
    // silently untranslated label unless something checks the whole table.
    const missing: string[] = [];
    for (const entry of OCCUPANCY_TABLE_2025) {
      for (const locale of REQUIRED_LOCALES) {
        if (tAt(entry.labelKey, locale) === entry.labelKey) {
          missing.push(`${locale}: ${entry.labelKey}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(OCCUPANCY_TABLE_2025.length).toBeGreaterThan(50);
  });

  it('translates every regulation option name in English and Spanish', () => {
    const missing: string[] = [];
    for (const role of REGULATION_ROLES) {
      for (const option of optionsForRole(role)) {
        for (const locale of REQUIRED_LOCALES) {
          if (tAt(option.nameKey, locale) === option.nameKey) {
            missing.push(`${locale}: ${option.nameKey}`);
          }
          // A name template that lost {edition} makes two editions indistinguishable.
          expect(dictFor(locale)[option.nameKey], `${option.nameKey} [${locale}]`)
            .toContain('{edition}');
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('translates every occupancy label distinctly, so the selector is usable', () => {
    for (const locale of REQUIRED_LOCALES) {
      const labels = OCCUPANCY_TABLE_2025.map((e) => tAt(e.labelKey, locale));
      const dup = labels.find((l, i) => labels.indexOf(l) !== i);
      expect(dup, `${locale}: two occupancy rows read identically`).toBeUndefined();
    }
  });
});
