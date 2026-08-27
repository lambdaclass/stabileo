/**
 * Basic mode must be complete in all three offered languages.
 *
 * `t()` falls back to English for a missing key, silently. That fallback is
 * what let a Spanish user read English trivia in a dialog nobody had checked,
 * and what hid 176 untranslated Portuguese strings across the editor. It is a
 * good runtime behaviour and a terrible development one: nothing fails, so
 * nothing gets fixed.
 *
 * This walks the source, collects every key the UI actually asks for, and
 * asserts all three dictionaries answer. Scoped to what Basic mode reaches —
 * PRO, Education, the DXF importer and the landing page have their own gaps and
 * their own PRs, and folding them in would make this fail for reasons that have
 * nothing to do with Basic.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';

const SRC = join(import.meta.dirname, '../../..');

/** Areas with their own translation debt and their own PRs. */
const OUT_OF_SCOPE = /^(pro\.|edu\.|cad\.|landing\.)/;
const SKIP_DIRS = ['__tests__', 'locales', 'pro', 'edu'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.svelte') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Keys requested with a literal, which is the only form that can be checked.
 *
 * A key built by concatenation — `t('a.' + b)` — is invisible here, which is
 * one more reason the codebase writes them out in full.
 *
 * It is not the only blind spot, and the other one is bigger: a key held in a
 * DATA STRUCTURE and passed as a variable — `t(cmd.labelKey)` — is equally
 * invisible. The whole ribbon is built that way, and 41 of its keys were
 * missing from Portuguese while this guard reported full coverage. The
 * namespace check below closes that: whatever the call site looks like, a
 * namespace the UI uses must exist in all three dictionaries.
 */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z][\w.]*)['`]\s*[,)]/g)) {
      if (!OUT_OF_SCOPE.test(m[1])) keys.add(m[1]);
    }
  }
  return keys;
}

const used = usedKeys();

/**
 * Keys as they are WRITTEN in a dictionary file, both quote styles.
 *
 * The files mix `'key':` and `"key":`, and a check that saw only one style
 * reported keys as missing that were sitting there in the other — which is
 * exactly what happened: 23 keys were "added" that already existed, producing
 * silent duplicates that only the TypeScript compiler caught.
 */
function writtenKeys(lang: string): string[] {
  const src = readFileSync(join(import.meta.dirname, `../locales/${lang}.ts`), 'utf8');
  return [...src.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]);
}

describe('the dictionaries are well formed', () => {
  it('no key is defined twice in any language', () => {
    // A duplicate is not merely untidy: the later one silently wins, so an
    // edit to the first has no effect and nothing says why.
    for (const lang of ['en', 'es', 'pt']) {
      const ks = writtenKeys(lang);
      const seen = new Set<string>();
      const dupes = ks.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
      expect([...new Set(dupes)], lang).toEqual([]);
    }
  });
});

describe('Basic mode is fully translated', () => {
  it('asks for a substantial number of keys — the scan is not silently empty', () => {
    // Guards the test itself: a broken regex would make everything below pass
    // vacuously, which is the worst possible outcome for a coverage check.
    expect(used.size).toBeGreaterThan(1000);
  });

  it('every key it asks for is defined in English', () => {
    // English is the fallback, so a key missing HERE renders as nothing at all
    // in every language. That is not a translation gap, it is a blank label.
    const missing = [...used].filter((k) => !(k in en)).sort();
    expect(missing).toEqual([]);
  });

  it('every key is defined in Spanish', () => {
    const missing = [...used].filter((k) => !(k in es)).sort();
    expect(missing).toEqual([]);
  });

  it('every key is defined in Portuguese', () => {
    const missing = [...used].filter((k) => !(k in pt)).sort();
    expect(missing).toEqual([]);
  });

  it('placeholders survive translation in both target languages', () => {
    // A `{name}` lost in translation renders the brace to the user; one
    // renamed silently drops the value. Both look like content bugs rather
    // than translation bugs, which is why they are worth catching here.
    const issues: string[] = [];
    for (const k of used) {
      /*
       * `{s}` is excluded: it is the English plural suffix — "1 mode{s}" —
       * and Spanish and Portuguese form plurals differently, so a translation
       * that drops it is CORRECT rather than broken. Every other token names a
       * value, and losing one of those silently drops it from the sentence.
       */
      const tokens = (s: string) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => n !== 's').sort().join(',');
      const ref = tokens(en[k] ?? '');
      for (const [lang, dict] of [['es', es], ['pt', pt]] as const) {
        const v = dict[k];
        if (v !== undefined && tokens(v) !== ref) issues.push(`${k} [${lang}]: "${ref}" vs "${tokens(v)}"`);
      }
    }
    expect(issues).toEqual([]);
  });
});

/**
 * Namespaces every Basic surface draws from, checked as WHOLE namespaces.
 *
 * The scan above can only see literal `t('...')` calls. These namespaces are
 * populated from data structures — ribbon commands, catalogue notes, grade
 * sources — where the key is a field and reaches `t()` as a variable. Nothing
 * in the source text says they are used at all.
 *
 * So they are checked by key parity instead: English is the reference, and a
 * key it has here must exist in the other two. That is a stricter test than
 * the scan and a weaker one than checking they are all reachable, which is the
 * right trade — an unused translated key costs nothing; a missing one ships
 * English to a Spanish reader.
 */
describe('namespaces filled from data, which the scan cannot see', () => {
  /*
   * `float.` and `selection.` earn their place the same way `ribbon.` did:
   * the list of what a drag can pick up is an array of records, and its
   * labels reach `t()` as `t(m.key)`. `float.selectShells` was missing from
   * Portuguese with every other check green.
   */
  const NAMESPACES = [
    'ribbon.', 'cat.', 'grade.src.', 'stress.tt.', 'pairing.',
    'float.', 'selection.', 'config.tip.', 'switch2d.',
  ];

  for (const ns of NAMESPACES) {
    it(`${ns}* is complete in es and pt`, () => {
      const keys = writtenKeys('en').filter((k) => k.startsWith(ns));
      expect(keys.length, `${ns} must actually have keys`).toBeGreaterThan(0);

      for (const lang of ['es', 'pt']) {
        const have = new Set(writtenKeys(lang));
        const missing = keys.filter((k) => !have.has(k));
        expect(missing, `${lang} is missing:\n${missing.join('\n')}`).toEqual([]);
      }
    });
  }
});
