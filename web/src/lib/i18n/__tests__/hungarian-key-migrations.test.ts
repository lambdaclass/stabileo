import { describe, expect, it } from 'vitest';
import main from '../locales/hu';
import full from '../locales/full/hu';
import browser from '../locales/browser/hu';
import { ALL_DICTS } from '../locales/all';

const dictionaries = [
  ['source', main],
  ['Node', full],
  ['browser', browser],
] as const;

const migrated = {
  'plates.state.unmeshed': 'nincs háló',
  'plates.state.stale': 'a háló elavult',
  'plates.state.invalid': 'érvénytelen körvonal',
  'combos.rules.seedCode': 'Kezdés a(z) {code} alapján',
  'combos.rules.noneCode': 'Még nincsenek szabályok. Adjon hozzá egyet, vagy kezdje a(z) {code} alapján.',
};

describe('Hungarian key migrations', () => {
  it.each(dictionaries)('known wrong result: #2081 removes retired English keys from the %s dictionary', (_name, dict) => {
    expect(Object.keys(dict).filter((key) => !(key in ALL_DICTS.en))).toEqual([]);
  });

  it.each(dictionaries)('known wrong result: #2081 preserves moved translations in the %s dictionary', (_name, dict) => {
    for (const [key, value] of Object.entries(migrated)) {
      expect(key in ALL_DICTS.en, key).toBe(true);
      expect(dict[key], key).toBe(value);
    }
  });

  it.each(dictionaries)('keeps an unchanged plate translation in the %s dictionary', (_name, dict) => {
    expect(dict['plates.kindHead']).toBe('Fajta');
  });
});
