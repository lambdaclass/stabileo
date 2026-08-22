/**
 * Every key the PRO workflow renders exists in every language the app offers.
 *
 * ── What this replaces ─────────────────────────────────────────────
 *
 * `locale-parity.test.ts` guards the `design.*` namespace across all fourteen shipped
 * dictionaries, and deliberately stops there: a full parity check across fourteen locales fails
 * on ~790 keys of inherited `landing.*` debt that no PR20 change touched.
 *
 * That scope was right while the picker offered two languages and the rest were unreachable. PR20
 * narrowed the picker to English, Español and Português — and the audit that followed found
 * **716 keys used by the PRO flow missing from Portuguese**, plus 111 more built from template
 * literals (the state names: VERIFIED, PROVISIONAL, FAILED…) that no static scan sees, plus 62
 * engine-message keys. All of them fell back to English, silently, under a picker that now
 * promised Portuguese.
 *
 * So this gate is scoped the other way round from its neighbour: ALL keys, but only the three
 * OFFERED locales, and only the keys the PRO surfaces actually reach. That is exactly the promise
 * `OFFERED_LOCALES` makes, and nothing weaker keeps it.
 *
 * ── How the keys are harvested ─────────────────────────────────────
 *
 * By reading the sources, not by listing them here — a hand-maintained list is a list that stops
 * matching the app. Two forms:
 *
 *   STATIC   `t('detailing.scene.showBars')`, and keys carried as data (`labelKey: '…'`).
 *   DYNAMIC  `t(\`detailing.state.${s}\`)`, which cannot be resolved statically. For those the
 *            PREFIX is harvested and every key English defines under it is required in the other
 *            two — English being the language every one of these families is complete in.
 *
 * The dynamic half is the half that mattered: it is where the design states and the viewer's
 * family and piece names live, and it is invisible to a naive `grep`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dictFor, OFFERED_LOCALES } from '../store.svelte';

const SRC = new URL('../../..', import.meta.url).pathname;

/**
 * The modules that produce what a PRO user reads.
 *
 * The components, plus the layers that MINT keys for them: the detailing engine (document notes,
 * skip reasons, conflict classes), the stores (autosave and file messages), the code adapters and
 * the exporters.
 */
const PRO_DIRS = [
  'components/pro',
  'lib/engine/detailing',
  'lib/store',
  'lib/codes',
  'lib/export',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === '__fixtures__') continue;
      out.push(...walk(full));
    } else if (name.endsWith('.ts') || name.endsWith('.svelte')) {
      out.push(full);
    }
  }
  return out;
}

const files = PRO_DIRS.flatMap((d) => walk(join(SRC, d)));

const staticKeys = new Set<string>();
const dynamicPrefixes = new Set<string>();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt[ep]?\(\s*'([^']+)'/g)) staticKeys.add(m[1]);
  for (const m of src.matchAll(/(?:labelKey|titleKey|key|reasonKey|refusedKey)\s*:\s*'([a-z][\w.]*\.[\w.]+)'/gi)) {
    staticKeys.add(m[1]);
  }
  // `t(`prefix.${expr}`)` — keep the literal head.
  for (const m of src.matchAll(/\bt[ep]?\(\s*`([^`$]*)\$\{/g)) {
    if (m[1]) dynamicPrefixes.add(m[1]);
  }
}

const en = dictFor('en');

/** Every key English defines under a harvested prefix. */
const dynamicKeys = new Set<string>();
for (const prefix of dynamicPrefixes) {
  for (const key of Object.keys(en)) if (key.startsWith(prefix)) dynamicKeys.add(key);
}

describe('the PRO workflow speaks every language it is offered in', () => {
  it('harvested a meaningful number of keys from the sources', () => {
    // A regex that stopped matching would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(60);
    expect(staticKeys.size).toBeGreaterThan(1000);
    expect(dynamicPrefixes.size).toBeGreaterThan(20);
    expect(dynamicKeys.size).toBeGreaterThan(100);
  });

  for (const locale of OFFERED_LOCALES) {
    it(`defines every statically-used PRO key in ${locale}`, () => {
      const dict = dictFor(locale);
      const missing = [...staticKeys].filter((k) => dict[k] === undefined).sort();
      expect(missing, `${missing.length} key(s) missing in ${locale}`).toEqual([]);
    });

    it(`defines every enumerated state and family name in ${locale}`, () => {
      // The ones a template literal builds: design states, scene families, piece kinds,
      // regulation roles, footing findings. English has them all; so must the rest.
      const dict = dictFor(locale);
      const missing = [...dynamicKeys].filter((k) => dict[k] === undefined).sort();
      expect(missing, `${missing.length} key(s) missing in ${locale}`).toEqual([]);
    });

    it(`declares no key twice in ${locale}`, () => {
      // The dictionaries are object literals: a repeated key is silently the last one, so the
      // translation someone wrote can be shadowed by an older one with no error anywhere.
      const src = readFileSync(join(SRC, `lib/i18n/locales/${locale}.ts`), 'utf8');
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const m of src.matchAll(/^\s*'([^']+)'\s*:/gm)) {
        if (seen.has(m[1])) dupes.add(m[1]);
        seen.add(m[1]);
      }
      expect([...dupes].sort()).toEqual([]);
    });
  }

  it('never renders a key name where a sentence belongs', () => {
    // `t()` returns the KEY when neither the active dictionary nor English has it. That is the
    // one failure a user sees as gibberish rather than as English, so it gets its own assertion
    // across every key this file harvested.
    const all = [...staticKeys, ...dynamicKeys];
    for (const locale of OFFERED_LOCALES) {
      const dict = dictFor(locale);
      const bare = all.filter((k) => dict[k] === k);
      expect(bare, `${locale} renders these keys as themselves`).toEqual([]);
    }
  });

  it('never leaks an internal enum name into a translation', () => {
    // `PROVISIONAL_BIAXIAL`, `SECTION_INADEQUATE` and friends are outcome identifiers. They are
    // legitimate as CSS classes and `data-` attributes; a dictionary VALUE containing one means
    // a name the engine uses internally reached the screen.
    const internal = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
    // File formats, and the code's own SYMBOLS. `K_LL` is the live-load element factor of
    // CIRSOC 101 art. 4.7.2 and belongs on screen exactly as the article writes it; it is an
    // engineering variable, not an identifier that escaped.
    const allowed = new Set([
      'CIRSOC', 'DXF', 'XLSX', 'PDF', 'IFC', 'STEP', 'GLB', 'JSON',
      'K_LL', 'K_ZT', 'A_T', 'G_F',
    ]);
    for (const locale of OFFERED_LOCALES) {
      const dict = dictFor(locale);
      const leaks: string[] = [];
      for (const key of [...staticKeys, ...dynamicKeys]) {
        const value = dict[key];
        if (typeof value !== 'string') continue;
        const hit = internal.exec(value);
        if (hit && !allowed.has(hit[0])) leaks.push(`${key}: ${hit[0]}`);
      }
      expect(leaks, `${locale} shows an internal identifier`).toEqual([]);
    }
  });

  it('keeps the same placeholders in all three languages', () => {
    // `{n}` renamed or dropped in one language is a sentence with a literal `{n}` in it, or a
    // number that never appears. Neither errors.
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const dicts = Object.fromEntries(OFFERED_LOCALES.map((l) => [l, dictFor(l)]));
    const wrong: string[] = [];
    for (const key of [...staticKeys, ...dynamicKeys]) {
      const reference = placeholders(dicts.en[key] ?? '');
      for (const locale of OFFERED_LOCALES) {
        if (locale === 'en') continue;
        const value = dicts[locale][key];
        if (typeof value !== 'string') continue;
        const mine = placeholders(value);
        if (mine.join(',') !== reference.join(',')) {
          wrong.push(`${locale} ${key}: [${mine}] vs en [${reference}]`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
