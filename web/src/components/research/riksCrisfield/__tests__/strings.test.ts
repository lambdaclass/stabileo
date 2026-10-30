import { expect, it } from 'vitest';
import { RIKS } from '../strings';

it('provides every benchmark key and preserves numeric claims in all research locales', () => {
  for (const locale of ['es', 'pt'] as const) {
    expect(Object.keys(RIKS[locale]).sort()).toEqual(Object.keys(RIKS.en).sort());
    for (const key of Object.keys(RIKS.en) as (keyof typeof RIKS.en)[]) {
      expect(RIKS[locale][key].trim().length).toBeGreaterThan(0);
      expect(RIKS[locale][key].match(/\d+/g), `${locale}.${key}`).toEqual(RIKS.en[key].match(/\d+/g));
    }
  }
});
