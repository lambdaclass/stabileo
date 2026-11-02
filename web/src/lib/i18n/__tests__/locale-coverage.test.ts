// A language still being translated renders English for what it lacks, so nothing at runtime
// notices a translation that stops half way; this gate does. A value equal to the English counts
// as translated only when listed in `same-as-english/<code>.ts`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_DICTS, completeLocales, partialLocales } from '../locales/all';
import { OFFERED_LOCALES } from '../store.svelte';
import { SAME_AS_ENGLISH as deSame } from '../locales/same-as-english/de';
import { SAME_AS_ENGLISH as frSame } from '../locales/same-as-english/fr';
import { SAME_AS_ENGLISH as trSame } from '../locales/same-as-english/tr';
import { POSTS } from '../../blog';
import { STANDING_PAGES } from '../../blog/pages';

const en = ALL_DICTS.en;
const enKeys = Object.keys(en);
const SAME: Record<string, readonly string[]> = { de: deSame, fr: frSame, tr: trSame };
const BASELINE: Record<string, number> = JSON.parse(
  readFileSync(join(import.meta.dirname, 'coverage-baseline.json'), 'utf8'),
);

const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** A placeholder glued to a word ("mode{s}") is a plural ending: a language whose plural is not a suffix leaves it out. */
const pluralEndings = (s: string) => new Set([...s.matchAll(/[\p{L})]\{(\w+)\}/gu)].map((m) => m[1]));

function placeholderMismatch(key: string, value: string): string | null {
  const optional = new Set([...pluralEndings(en[key]), ...pluralEndings(value)]);
  const want = names(en[key]).filter((n) => !optional.has(n)).sort().join(',');
  const got = names(value).filter((n) => !optional.has(n)).sort().join(',');
  return want === got ? null : `{${got}} vs en {${want}}`;
}

function translated(code: string): string[] {
  const dict = ALL_DICTS[code];
  const same = new Set(SAME[code] ?? []);
  return enKeys.filter((k) => k in dict && (dict[k] !== en[k] || same.has(k) || !SAME[code]));
}

describe('the languages offered', () => {
  it('are each either complete or being translated, never neither', () => {
    const complete = completeLocales();
    const partial = partialLocales();
    for (const code of OFFERED_LOCALES) {
      expect(complete.includes(code) !== partial.includes(code), `${code}`).toBe(true);
    }
  });

  it('report how far each translation is', () => {
    const lines = partialLocales().map((code) => {
      const n = translated(code).length;
      return `${code}: ${n} of ${enKeys.length} keys (${((100 * n) / enKeys.length).toFixed(1)} %)`;
    });
    if (lines.length) console.info(`Translations in progress:\n  ${lines.join('\n  ')}`);
    expect(enKeys.length).toBeGreaterThan(10000);
  });
});

for (const code of OFFERED_LOCALES) {
  if (code === 'en') continue;
  describe(`${code}`, () => {
    const dict = ALL_DICTS[code];

    it('has no key the English no longer has', () => {
      const stale = Object.keys(dict).filter((k) => !(k in en));
      expect(stale, `${stale.length} stale key(s)`).toEqual([]);
    });

    it('keeps the English placeholders in every value', () => {
      const wrong = Object.keys(dict)
        .filter((k) => k in en && placeholderMismatch(k, dict[k]))
        .map((k) => `${k}: ${placeholderMismatch(k, dict[k])}`);
      expect(wrong).toEqual([]);
    });

    if (SAME[code]) {
      it('lists as same-as-English only keys whose value is the English', () => {
        const wrong = SAME[code].filter((k) => !(k in dict) || dict[k] !== en[k]);
        expect(wrong).toEqual([]);
      });
    }

    if (completeLocales().includes(code)) {
      it('has every key, and nothing left in English that is not meant to be', () => {
        const missing = enKeys.filter((k) => !(k in dict));
        expect(missing, `${missing.length} key(s) missing`).toEqual([]);
        if (SAME[code]) {
          const done = new Set(translated(code));
          const left = enKeys.filter((k) => !done.has(k));
          expect(left.length, `left as English: ${left.slice(0, 20).join(', ')}`).toBe(0);
        }
      });

      it('has every blog post and standing page written in it', () => {
        const posts = POSTS.filter((p) => !(p.i18n as Record<string, unknown>)[code]).map((p) => p.slug);
        const pages = STANDING_PAGES.filter((p) => !(p.i18n as Record<string, unknown>)[code]).map((p) => p.path);
        expect({ posts, pages }).toEqual({ posts: [], pages: [] });
      });
    } else {
      it('does not go backwards', () => {
        expect(BASELINE[code], `no baseline for ${code} in coverage-baseline.json`).toBeTypeOf('number');
        expect(translated(code).length).toBeGreaterThanOrEqual(BASELINE[code]);
      });

      it('is marked complete once it is', () => {
        expect(
          translated(code).length,
          `${code} translates every key: set COMPLETE = true in locales/full/${code}.ts`,
        ).toBeLessThan(enKeys.length);
      });
    }
  });
}
