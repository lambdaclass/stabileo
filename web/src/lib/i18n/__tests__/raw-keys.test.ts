/**
 * The raw-key detector of the e2e check (#719): it finds a key fed to it (the negative case), and
 * it finds nothing in the app's own translations, which are what the screens are made of.
 */
import { describe, it, expect } from 'vitest';
import es from '../locales/es';
import en from '../locales/en';
import pt from '../locales/pt';
import steelEs from '../locales/steel/es';
import steelEn from '../locales/steel/en';
import steelPt from '../locales/steel/pt';
import { stepsEs, stepsEn, stepsPt } from '../locales/steps';
import { rawKeyIndex, findRawKeys } from '../raw-keys';

const DICTS = { es: { ...es, ...steelEs, ...stepsEs }, en: { ...en, ...steelEn, ...stepsEn }, pt: { ...pt, ...steelPt, ...stepsPt } };
const index = rawKeyIndex(Object.values(DICTS));
const texts = (hits: ReturnType<typeof findRawKeys>) => hits.map((h) => h.text);

describe('findRawKeys', () => {
  it('NEGATIVE: finds the key the desktop app showed as its project name and window title', () => {
    expect(index.keys.has('tabBar.newStructure')).toBe(true);
    expect(findRawKeys('tabBar.newStructure', index)).toEqual([{ text: 'tabBar.newStructure', kind: 'key' }]);
    expect(texts(findRawKeys('tabBar.newStructure — Stabileo', index))).toEqual(['tabBar.newStructure']);
    expect(texts(findRawKeys('Proyecto: tabBar.newStructure.', index))).toEqual(['tabBar.newStructure']);
    expect(texts(findRawKeys('(design.banner.rerunCodeCheck)', index))).toEqual(['design.banner.rerunCodeCheck']);
  });

  it('NEGATIVE: finds a key that does not exist under a namespace that does', () => {
    expect(findRawKeys('tabBar.newStructur', index)).toEqual([{ text: 'tabBar.newStructur', kind: 'namespace' }]);
  });

  it('leaves ordinary text alone', () => {
    for (const s of [
      'Sign in to Stabileo', 'stabileo.com', 'design.ded', 'pro.json', 'https://stabileo.com/blog/x.y', 'model.ded', 'portico.ded.json',
      'e.g. 3.14 kN·m', 'v0.3.0', 'IPN 300', 'N.m', 'a.b', 'user@mail.com', 'docs/verification/PROVENANCE.md',
    ]) expect(findRawKeys(s, index), s).toEqual([]);
  });

  it('finds nothing in any translation of the three offered languages', () => {
    for (const [loc, d] of Object.entries(DICTS)) {
      const hits = Object.entries(d).flatMap(([k, v]) => findRawKeys(String(v), index).map((h) => `${loc} ${k}: ${h.text}`));
      expect(hits).toEqual([]);
    }
  });
});
