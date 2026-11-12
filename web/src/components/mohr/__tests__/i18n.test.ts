import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mohrTranslations } from '../i18n';
import { MOHR_IDS } from '../../tools/mohr-tools';
import { hubTranslations as mohrToolTranslations } from '../../tools/hub-i18n';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';

const SAME_AS_ENGLISH = ['pt mohr.face', 'fr mohr.face', 'fr mohr.conventions', 'fr mohr.compression', 'de mohr.sym', 'fr mohr.sym'];

const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Mohr tool strings', () => {
  for (const [label, dicts] of [['component', mohrTranslations]] as const) {
    it(`${label}: every language has every key, with the same placeholders`, () => {
      const keys = Object.keys(dicts.en).sort();
      const same: string[] = [];
      for (const locale of PUBLIC_LOCALES) {
        expect(Object.keys(dicts[locale] ?? {}).sort(), locale).toEqual(keys);
        for (const key of keys) {
          expect(dicts[locale][key].trim(), `${locale} ${key}`).not.toBe('');
          expect(names(dicts[locale][key]), `${locale} ${key}`).toEqual(names(dicts.en[key]));
          if (locale !== 'en' && dicts[locale][key] === dicts.en[key]) same.push(`${locale} ${key}`);
        }
      }
      expect(same.filter((entry) => !SAME_AS_ENGLISH.includes(entry))).toEqual([]);
    });
  }

  it('the listing names both tools', () => {
    for (const id of MOHR_IDS) for (const suffix of ['', '.subtitle', '.case']) expect(mohrToolTranslations.en[`tools.${id}${suffix}`]).toBeTruthy();
  });

  it('every key the components ask for exists', () => {
    const dir = join(import.meta.dirname, '..');
    const used = new Set<string>();
    for (const file of [...readdirSync(dir).filter((f) => f.endsWith('.svelte')).map((f) => join(dir, f)), join(dir, '../tools/MohrTool.svelte')]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/tm\('([\w.]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(30);
    for (const key of used) expect(mohrTranslations.en[key], key).toBeTruthy();
    for (const id of ['general', 'uniaxial', 'biaxial', 'triaxial', 'shear', 'hydrostatic']) expect(mohrTranslations.en[`mohr.preset.${id}`]).toBeTruthy();
    for (const kind of ['Plane', 'Space']) for (const i of [1, 2, 3, 4]) expect(mohrTranslations.en[`mohr.help${kind}.${i}`]).toBeTruthy();
  });

  it('Spanish speaks with vos', () => {
    expect(mohrTranslations.es['mohr.pickTip']).toMatch(/^Tocá la esfera/);
    expect(mohrTranslations.es['mohr.dragHint']).toMatch(/^Arrastrá X′/);
    expect(mohrTranslations.es['mohr.helpPlane.1']).toMatch(/^Cargá/);
    for (const value of Object.values(mohrTranslations.es)) expect(value).not.toMatch(/\b(haga|toque|ingrese|elija|puede)\b/i);
  });
});
