import { afterEach, describe, expect, it } from 'vitest';
import en from '../locales/en';
import es from '../locales/es';
import pt from '../locales/pt';
import de from '../locales/de';
import fr from '../locales/fr';
import tr from '../locales/tr';
import { setLocale, tpn } from '../index';
import { ensureLocale } from '../store.svelte';

const DICTS: Record<string, Record<string, string>> = { en, es, pt, de, fr, tr };
const PLURAL_STEMS = [
  'solveProgress.warnings', 'solveProgress.warningsBasic',
  'rcSheets.countMembers', 'rcSheets.countFailing', 'rcSheets.wallsToMesh', 'rcSheets.basis.combinations',
  'rcSheets.plans.done', 'rcSheets.elev.totals', 'rcSheets.punchFig.stirrups', 'rcSheets.resize.baseUnheld', 'rcSheets.resize.baseHeld',
];
const NOT_COUNTED = new Set(['pt.sys.one']);

describe('plural forms', () => {
  afterEach(() => setLocale('en'));

  it.each(Object.keys(DICTS))('%s has both forms of every counted string, the other one with its count', (locale) => {
    const dict = DICTS[locale]!;
    for (const stem of PLURAL_STEMS) {
      expect(dict[`${stem}.one`], `${locale} ${stem}.one`).toBeTypeOf('string');
      expect(dict[`${stem}.other`], `${locale} ${stem}.other`).toContain('{n}');
      expect(dict[stem], `${locale} ${stem} without a form`).toBeUndefined();
    }
    for (const key of Object.keys(dict)) {
      if (key.endsWith('.one') && !NOT_COUNTED.has(key)) expect(dict[`${key.slice(0, -4)}.other`], `${locale} ${key}`).toBeTypeOf('string');
    }
  });

  it('says one in the singular and many in the plural', async () => {
    await ensureLocale('es');
    setLocale('es');
    expect(tpn('rcSheets.countFailing', 1)).toBe('1 no verifica');
    expect(tpn('rcSheets.countFailing', 3)).toBe('3 no verifican');
    expect(tpn('rcSheets.countFailing', 0)).toBe('0 no verifican');
    expect(tpn('rcSheets.elev.totals', 1, { h: 40 })).toBe('1 estribo en 40 cm');
  });
});
