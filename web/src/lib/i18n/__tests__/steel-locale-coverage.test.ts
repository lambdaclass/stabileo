/**
 * The metallic namespace against the locales the app actually offers.
 *
 * ── What this adds to `steel-keys.test.ts` ─────────────────────────
 *
 * That file checks the three shipped steel dictionaries hold the same key set and that every key
 * the source asks for is translated. This one is about the SHAPE of the coverage, which is what
 * the language audit turned into a question:
 *
 *   · the app offers three locales and ships fourteen. The other eleven are unreachable —
 *     `getInitialLocale` refuses a stored locale that is not offered, and `detectBrowserLocale`
 *     is typed to return an offered one — so the metallic namespace not being in them is not a
 *     user-visible gap. That is asserted, because if `OFFERED_LOCALES` grows without the steel
 *     namespace growing with it, the half-translated state the narrowing removed comes back.
 *
 *   · the 100 keys that carry a WARNING, an ASSUMPTION or a STATE are the ones that change how a
 *     result is read. They are derived by category rather than listed, so a warning added later
 *     is covered without anybody remembering this file.
 *
 *   · no shipped locale can render a raw metallic key, because English carries the whole
 *     namespace and is the fallback. That is the property the audit rests on.
 *
 * Full audit: `docs/handoffs/m1-steel-i18n-audit.md`. Terminology decisions that have to happen
 * before any of the eleven is translated: `docs/handoffs/m1-steel-terminology.md`.
 */

import { describe, it, expect } from 'vitest';
import steelEs from '../locales/steel/es';
import steelEn from '../locales/steel/en';
import steelPt from '../locales/steel/pt';
import { OFFERED_LOCALES, dictFor, shippedLocales, tAt } from '../store.svelte';

const STEEL_DICTS = { es: steelEs, en: steelEn, pt: steelPt } as const;

/**
 * What a key DOES, which is what decides the order it has to be translated in.
 *
 * A label read in the wrong language is a nuisance. A warning read in the wrong language is a
 * number whose absence goes unexplained, and an assumption read in the wrong language travels
 * onto a report. The classification is a regex over the key rather than a hand-kept list, so a
 * key added later lands in a category by itself.
 */
function categoryOf(key: string): 'warning' | 'assumption' | 'state' | 'help' | 'label' {
  if (/^generator\.assume\./.test(key)) return 'assumption';
  if (/^steel\.status\./.test(key)) return 'state';
  if (/notice|warning|experimental|Banner|problem|unavailable|refus|blocked|empty|noAuthority|typicalMark|Unresolved|inferred|nonFerrous|Sharp|byRule|NotPublished|minimumModulus|firstBand|Derived/i.test(key)) {
    return 'warning';
  }
  if (/hint|\.desc$|title\./.test(key)) return 'help';
  return 'label';
}

/** The keys whose language changes how a result is read. */
function interpretationKeys(): string[] {
  return Object.keys(steelEs).filter((k) => {
    const c = categoryOf(k);
    return c === 'warning' || c === 'assumption' || c === 'state';
  });
}

describe('the offered locales, and the eleven that are not', () => {
  it('offers exactly three, and ships eleven more that no user path reaches', () => {
    // If this fails because a locale was added, the steel namespace has to grow with it — the
    // next test is the one that says so.
    expect([...OFFERED_LOCALES]).toEqual(['es', 'en', 'pt']);
    expect(shippedLocales().length).toBe(14);
  });

  it('has the metallic namespace complete in every locale it offers', () => {
    // The assertion that matters when `OFFERED_LOCALES` grows: an offered locale with a partial
    // metallic namespace is the half-translated state the narrowing was written to remove.
    const reference = Object.keys(steelEs).sort();
    for (const locale of OFFERED_LOCALES) {
      const dict = STEEL_DICTS[locale];
      expect(dict, `${locale} has no steel dictionary — it is offered and must`).toBeTruthy();
      expect(Object.keys(dict).sort(), `${locale} key set`).toEqual(reference);
    }
  });

  it('renders no metallic key as itself, in any locale it ships', () => {
    /*
     * Not only the offered three. `tAt` falls back to English, which carries the whole namespace,
     * so even a locale nobody can select resolves every metallic key to real text. That is the
     * property the audit rests on: the fallback is explicit and complete, so there is no silent
     * key anywhere.
     */
    const sample = [
      'steel.panel.title', 'steel.panel.experimentalBanner',
      'steel.status.NOT_DESIGNED', 'steel.status.EXPERIMENTAL',
      'steel.props.unavailable.centroidUnknown', 'steel.grades.pairing.unusual',
      'generator.assume.roofWithoutPurlins',
    ];
    for (const locale of shippedLocales()) {
      for (const key of sample) {
        const value = tAt(key, locale);
        expect(value, `${locale} renders ${key} as its own name`).not.toBe(key);
        expect(value.trim().length, `${locale} ${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('resolves an unknown locale through English rather than through the key', () => {
    // `dicts[locale] ?? dicts.en`. A locale code that does not exist at all still gets text.
    expect(tAt('steel.panel.title', 'xx')).toBe(tAt('steel.panel.title', 'en'));
    expect(tAt('steel.panel.title', 'xx')).not.toBe('steel.panel.title');
  });
});

describe('the keys that change how a result is read', () => {
  const priority = interpretationKeys();

  it('is a real subset, large enough to be worth ordering', () => {
    // 96 at the time of the audit — 64 warnings, 24 assumptions, 8 state labels and
    // descriptions. Asserted as a floor rather than as a fixture: the point is that this set is a
    // substantial minority of the namespace and has to be translated first.
    expect(priority.length).toBeGreaterThanOrEqual(90);
    expect(priority.length).toBeLessThan(Object.keys(steelEs).length);
  });

  it('is translated in all three offered locales, with no key left as itself', () => {
    for (const locale of OFFERED_LOCALES) {
      const dict = STEEL_DICTS[locale] as Record<string, string>;
      for (const key of priority) {
        const value = dict[key];
        expect(value, `${locale} is missing ${key}`).toBeTruthy();
        expect(value, `${locale} left ${key} as its own key`).not.toBe(key);
        // A warning that is a single word is not a warning. The shortest legitimate one in this
        // set is a state label, so the floor is deliberately low.
        expect(value.trim().length, `${locale} ${key} is too short to explain anything`).toBeGreaterThan(2);
      }
    }
  });

  it('covers the four states with their descriptions, and every generator assumption', () => {
    /*
     * Eight, not four: every state ships a label AND a `.desc`, and the description is where the
     * distinction that matters is spelled out — "nobody tried" against "something was computed
     * with no authority behind it". Both are interpretation-critical, so both are in the set.
     */
    const states = priority.filter((k) => categoryOf(k) === 'state');
    expect(states.length).toBe(8);
    expect(new Set(states.map((k) => k.replace(/\.desc$/, ''))).size).toBe(4);

    const assumptions = priority.filter((k) => categoryOf(k) === 'assumption');
    expect(assumptions.length).toBeGreaterThanOrEqual(24);
  });

  /**
   * Words that are legitimately identical across the three languages.
   *
   * The heuristic below treats an identical es/en value as a probable paste, and it caught a real
   * exception on the first run: `steel.status.EXPERIMENTAL` is "Experimental" in Spanish, English
   * AND Portuguese. It is a cognate, not a copy.
   *
   * Listed by key rather than by loosening the rule, because this is the term the terminology
   * inventory marks as having NO margin — it has to say "there is a number and no authority
   * behind it", never "this is in beta" — so the day someone changes it, the change is visible
   * here.
   */
  const COGNATES = new Set(['steel.status.EXPERIMENTAL']);

  it('never says the same thing in two languages, unless the word really is the same', () => {
    const suspicious: string[] = [];
    for (const key of priority) {
      if (COGNATES.has(key)) continue;
      const es = (steelEs as Record<string, string>)[key];
      const en = (steelEn as Record<string, string>)[key];
      if (es !== en) continue;
      // A value that is essentially a designation or a symbol reads the same everywhere.
      if (/^[A-Z0-9\s·×.,/+()-]+$/.test(es)) continue;
      suspicious.push(`${key}: ${es}`);
    }
    expect(suspicious, `identical es/en values:\n${suspicious.join('\n')}`).toEqual([]);
  });

  it('keeps the cognates identical in all three, so the list stays honest', () => {
    // If a cognate stops being one in some language, it leaves the list rather than sitting in it
    // as a permanent exemption.
    for (const key of COGNATES) {
      const es = (steelEs as Record<string, string>)[key];
      expect((steelEn as Record<string, string>)[key], `${key} en`).toBe(es);
      expect((steelPt as Record<string, string>)[key], `${key} pt`).toBe(es);
    }
  });
});

describe('the eleven unreachable locales', () => {
  it('carry the 22 joints labels that predate the namespace, and none of the namespace itself', () => {
    /*
     * The finding that makes "offer a fourth locale" more than a translation job: those eleven
     * dictionaries already hold 22 `conn.*` labels, written before the metallic namespace existed.
     * So a fourth locale is 292 keys to translate plus 22 to reconcile, and a user of it would
     * otherwise see 22 translated strings among 292 English ones in the same panel.
     */
    const unreachable = shippedLocales().filter((l) => !(OFFERED_LOCALES as readonly string[]).includes(l));
    expect(unreachable.length).toBe(11);

    for (const locale of unreachable) {
      const dict = dictFor(locale);
      const connKeys = Object.keys(dict).filter((k) => k.startsWith('conn.'));
      const steelKeys = Object.keys(dict).filter((k) => /^(steel|generator)\./.test(k));
      expect(connKeys.length, `${locale} conn.* count`).toBe(22);
      // None of the namespace M1 owns: those live in `locales/steel/*` and are merged only for
      // the three offered locales.
      expect(steelKeys, `${locale} carries steel namespace keys`).toEqual([]);
    }
  });

  it('do not collide with the metallic namespace, so folding one in later is additive', () => {
    const namespaceKeys = new Set(Object.keys(steelEs));
    for (const locale of shippedLocales()) {
      if ((OFFERED_LOCALES as readonly string[]).includes(locale)) continue;
      const overlap = Object.keys(dictFor(locale)).filter((k) => namespaceKeys.has(k));
      expect(overlap, `${locale} would collide on: ${overlap.join(', ')}`).toEqual([]);
    }
  });
});
