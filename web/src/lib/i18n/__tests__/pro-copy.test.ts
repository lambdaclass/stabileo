import { describe, it, expect } from 'vitest';
import { unfinishedProClaims, type CopyLocale } from '../pro-copy';
import { allDictFor } from '../locales/all';
import { POSTS } from '../../blog';
import { STANDING_PAGES } from '../../blog/pages';
import { inLocale } from '../../blog/types';

const LOCALES: CopyLocale[] = ['es', 'en', 'pt', 'de', 'fr', 'tr'];

function proPartOfTour(tour: string): string {
  const start = tour.indexOf('PRO</strong>');
  return tour.slice(start, tour.indexOf('<br', start));
}

describe('PRO is presented as available', () => {
  for (const l of LOCALES) {
    const d = allDictFor(l);

    it(`${l}: the landing's PRO section and the tour say in development only of code design`, () => {
      for (const key of ['landing.proCalcP', 'landing.proCalcShots', 'landing.ebProCalc', 'landing.proCalcH']) {
        expect(unfinishedProClaims(d[key], l, { aboutPro: true }), key).toEqual([]);
      }
      expect(unfinishedProClaims(proPartOfTour(d['tour.modeToggleDesc']), l, { aboutPro: true })).toEqual([]);
    });

    it(`${l}: no landing text, post or standing page calls PRO unfinished`, () => {
      const landing = Object.entries(d).filter(([k]) => k.startsWith('landing.'));
      for (const [key, value] of landing) expect(unfinishedProClaims(value, l, { aboutPro: false }), key).toEqual([]);
      for (const post of POSTS) expect(unfinishedProClaims(JSON.stringify(inLocale(post.i18n, l)), l, { aboutPro: false }), post.slug).toEqual([]);
      for (const page of STANDING_PAGES) expect(unfinishedProClaims(JSON.stringify(inLocale(page.i18n, l)), l, { aboutPro: false }), page.path).toEqual([]);
    });
  }

  it('catches the sentences it was written for', () => {
    expect(unfinishedProClaims('Está en desarrollo, con acceso libre para quien quiera probarlo.', 'es', { aboutPro: true })).toHaveLength(1);
    expect(unfinishedProClaims('Ver los resultados. PRO está en beta.', 'es', { aboutPro: false })).toEqual(['PRO está en beta.']);
    expect(unfinishedProClaims('Le module PRO est encore en développement.', 'fr', { aboutPro: false })).toHaveLength(1);
    expect(unfinishedProClaims('PRO modu hâlâ geliştirme aşamasında.', 'tr', { aboutPro: false })).toHaveLength(1);
    expect(unfinishedProClaims('Die normgemäße Bemessung in PRO ist noch in Entwicklung.', 'de', { aboutPro: false })).toEqual([]);
  });
});
