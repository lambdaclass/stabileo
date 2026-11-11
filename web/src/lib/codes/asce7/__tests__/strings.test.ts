import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';
import de from '../../../i18n/locales/de';
import fr from '../../../i18n/locales/fr';
import tr from '../../../i18n/locales/tr';
import { OCCUPANCY_TABLE_ASCE7_22 } from '../live-loads';
import { PERIOD_PARAMETERS, SYSTEMS } from '../seismic';

const LANGS = ['es', 'en', 'pt', 'de', 'fr', 'tr'];
const dicts = { es, en, pt, de, fr, tr } as Record<string, Record<string, string>>;
const table = new Proxy({} as Record<string, Record<string, string>>, { get: (_, k: string) => (en as Record<string, string>)[k] === undefined ? undefined : Object.fromEntries(LANGS.map((l) => [l, dicts[l]![k]!])) });
const here = fileURLToPath(new URL('.', import.meta.url));
const sources = [join(here, '..'), join(here, '../../../../components/pro/load-codes/asce7')]
  .flatMap((dir) => readdirSync(dir).filter((f) => /\.(ts|svelte)$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8')));

describe('ASCE 7-22 strings', () => {
  it('every key the module and its inputs name is in the locale files, in the six languages, with the same parameters', () => {
    const named = new Set(sources.flatMap((s) => [...s.matchAll(/'(loads\.asce7\.[A-Za-z0-9.]+[A-Za-z0-9])'/g)].map((m) => m[1]!)));
    const keys = [
      ...named,
      ...OCCUPANCY_TABLE_ASCE7_22.map((o) => o.labelKey),
      ...Object.keys(SYSTEMS).map((k) => `loads.asce7.system.${k}`), 'loads.asce7.system.custom',
      ...Object.keys(PERIOD_PARAMETERS).map((k) => `loads.asce7.period.${k}`),
      ...['all', 'cases13', 'case1'].map((k) => `loads.asce7.ui.caseSet.${k}`),
    ];
    for (const k of keys) {
      expect(table[k], k).toBeDefined();
      const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
      for (const l of LANGS) {
        expect(table[k]![l], `${k} ${l}`).toBeTruthy();
        expect(params(table[k]![l]!), `${k} ${l}`).toBe(params(table[k]!.en!));
      }
    }
  });
});
