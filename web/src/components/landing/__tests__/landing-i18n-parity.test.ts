/**
 * Every language the public landing offers actually speaks the whole page.
 *
 * The landing offers the locales in PUBLIC_LOCALES (src/lib/i18n/store.svelte.ts)
 * and nothing else. `t()` falls back to English silently, so a missing key
 * renders an English sentence in the middle of a Spanish or Portuguese page and
 * nothing errors. That is precisely the defect this guards — and the reason the
 * list of offered locales and this test have to move together: adding a locale
 * to PUBLIC_LOCALES without its copy fails here rather than shipping a page
 * that switches language halfway down.
 *
 * Scope is derived from the source, not from a hand-maintained list: the test
 * scans every landing component for `t('landing.…')` and requires each key it
 * finds to exist in every offered dictionary. Adding a section with
 * untranslated copy therefore fails here, without anyone remembering to update
 * this file.
 *
 * Scope note: an earlier revision also asserted the editor's ribbon keys here,
 * because the landing embedded a live instance of the editor and rendered them
 * inside the page. That section is gone, so the assertion went with it. The
 * ribbon's Portuguese stays — it is a correct translation of real application
 * strings, and the editor is one click away — it is simply no longer the
 * landing's business to gate it.
 *
 * The repo-wide locale-parity test (src/lib/i18n/__tests__) is deliberately
 * untouched: it covers all fourteen dictionaries and a different namespace.
 */
import { describe, it, expect } from 'vitest';
import en from '../../../lib/i18n/locales/en';
import { PUBLIC_LOCALES, dictFor } from '../../../lib/i18n/store.svelte';

const sources = import.meta.glob('../**/*.{svelte,ts}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function usedKeys(): string[] {
  const found = new Set<string>();
  for (const [path, src] of Object.entries(sources)) {
    if (path.includes('__tests__')) continue;
    for (const m of src.matchAll(/t\(\s*'(landing\.[A-Za-z0-9_]+)'\s*\)/g)) found.add(m[1]);
    // Keys held in data tables and passed through `t()` indirectly.
    for (const m of src.matchAll(/'(landing\.[A-Za-z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** Keys built at runtime as `'landing.' + key`, which the regex cannot see. */
const COMPUTED_PREFIXED = ['capLin', 'capNl', 'capEl', 'capTd', 'stT', 'stPa', 'stR'];

describe('public landing i18n', () => {
  const keys = usedKeys();
  const enDict = en as Record<string, string>;

  it('finds a plausible number of landing keys to check', () => {
    expect(keys.length).toBeGreaterThan(80);
  });

  it('every landing key used by a component exists in English', () => {
    const missing = keys.filter((k) => !(k in en));
    expect(missing, `missing from en.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  for (const locale of PUBLIC_LOCALES.filter((l) => l !== 'en')) {
    const dict = () => dictFor(locale) as Record<string, string>;

    it(`${locale} has every landing key used by a component`, () => {
      const d = dict();
      const missing = keys.filter((k) => !(k in d));
      expect(missing, `missing from ${locale}.ts — these would render in English on the ${locale} landing:\n${missing.join('\n')}`).toEqual([]);
    });

    it(`${locale} has the runtime-composed capability and status keys`, () => {
      const d = dict();
      for (const prefix of COMPUTED_PREFIXED) {
        const group = Object.keys(en).filter((k) => new RegExp(`^landing\\.${prefix}\\d+$`).test(k));
        expect(group.length, `en.ts has no landing.${prefix}<n> keys`).toBeGreaterThan(0);
        const missing = group.filter((k) => !(k in d));
        expect(missing, `missing from ${locale}.ts:\n${missing.join('\n')}`).toEqual([]);
      }
    });

    it(`${locale} is translated, not English copied across`, () => {
      // A locale that "has" every key by repeating English reads as complete and
      // is not. Sampling the longest strings catches that without pretending to
      // judge translation quality: identical prose in two languages is the tell.
      const d = dict();
      const sample = keys
        .filter((k) => typeof enDict[k] === 'string' && enDict[k].length > 40)
        .sort((a, b) => enDict[b].length - enDict[a].length)
        .slice(0, 40);
      const copied = sample.filter((k) => d[k] === enDict[k]);
      expect(copied, `${locale} repeats the English text for: ${copied.join(', ')}`).toEqual([]);
    });
  }

  /*
   * Guards against a translation that is present, non-empty, not a copy of the
   * English — and stale anyway.
   *
   * That combination is what the checks above cannot see, and it shipped: the
   * Portuguese landing carried three sentences from a previous version of the
   * Education section ("Wizard DSM passo a passo…" where English said "Seven
   * predefined exercises…"), a truss description missing its last two
   * sentences, and a steel-checker line that named a criterion the other two
   * languages do not mention. All four passed every assertion above, because
   * they were real Portuguese of a plausible length.
   *
   * Three signals survive translation and catch exactly that.
   *
   * Scope here is EVERY `landing.*` and `blog.*` key in the English
   * dictionary, not the ones `usedKeys()` finds. That is deliberate and it is
   * the reason the first version of this gate missed two of the four defects
   * it was written for: the source scan cannot see keys composed at runtime
   * (`t('landing.' + key)`), and `eduNow1`, `eduNow2`, `eduNow3` — three of
   * the four — are exactly those. Checking a superset costs nothing; checking
   * only what a regex can find was worth nothing here.
   */
  describe('the offered locales say the same thing, not merely something', () => {
    const publicKeys = Object.keys(en).filter((k) => k.startsWith('landing.') || k.startsWith('blog.'));
    /** Standards, formats and tools. A locale must not name a different one. */
    const TECH = /\b(?:CIRSOC|AISC|ACI|AISI|NDS|TMS|NAFEMS|ANSYS|SAP2000|STAAD|OpenSees|Code_Aster|AGPL|IFC|DXF|SVG|XLSX|PDF|WebAssembly|Rust|LRFD|DSM|BIM|KL\/r|P-Δ|Bredt|Cauchy|Saint-Venant|Navier|Jourawski|Mohr|Hermite)\b/g;

    const numbers = (v: string) => (v.match(/\d+(?:[.,]\d+)?/g) ?? []).sort();
    const tech = (v: string) => [...new Set(v.match(TECH) ?? [])].sort();

    it('has a plausible number of public keys to check', () => {
      // A scope that silently shrank to nothing would make all six vacuous.
      expect(publicKeys.length).toBeGreaterThan(300);
    });

    for (const locale of PUBLIC_LOCALES.filter((l) => l !== 'en')) {
      it(`${locale} quotes the same figures as English`, () => {
        const d = dictFor(locale) as Record<string, string>;
        const wrong = publicKeys.filter((k) => k in d && String(numbers(d[k])) !== String(numbers(enDict[k])));
        expect(wrong.map((k) => `${k}: en ${numbers(enDict[k])} vs ${locale} ${numbers(d[k])}`)).toEqual([]);
      });

      it(`${locale} names the same standards and formats as English`, () => {
        const d = dictFor(locale) as Record<string, string>;
        const wrong = publicKeys.filter((k) => k in d && String(tech(d[k])) !== String(tech(enDict[k])));
        expect(wrong.map((k) => `${k}: en [${tech(enDict[k])}] vs ${locale} [${tech(d[k])}]`)).toEqual([]);
      });

      it(`${locale} is not a truncation of English`, () => {
        // Observed range across both locales today is 0.75–1.30 of the English
        // length; the band is deliberately wider than that. It is here to
        // catch a translation that stopped halfway, not to police style.
        const d = dictFor(locale) as Record<string, string>;
        const wrong = publicKeys
          .filter((k) => k in d && enDict[k].length > 60)
          .map((k) => [k, d[k].length / enDict[k].length] as const)
          .filter(([, r]) => r < 0.6 || r > 1.7);
        expect(wrong.map(([k, r]) => `${k}: ${r.toFixed(2)}× the English length`)).toEqual([]);
      });
    }
  });

  it('no landing key used by a component is an empty string in an offered locale', () => {
    const blank: string[] = [];
    for (const locale of PUBLIC_LOCALES) {
      const d = dictFor(locale) as Record<string, string>;
      for (const k of keys) if (k in d && d[k].trim() === '') blank.push(`${locale}:${k}`);
    }
    expect(blank).toEqual([]);
  });
});
