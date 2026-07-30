import { describe, it, expect } from 'vitest';
import en from '../locales/en';
import es from '../locales/es';

/**
 * The brief requires every new UI string to exist in English and Spanish. `t()` falls
 * back to English when a key is missing, so a missing Spanish key is invisible at
 * runtime and would ship as untranslated text in the app's primary UI language.
 */
const PREFIXES = ['codes.', 'loads.cirsoc101.', 'loads.cirsoc102.',
  'regulations.', 'revisions.', 'loadPlan.', 'materials.', 'maturity.', 'detailing.',
  'footing.', 'geotechnical.'];

function keysWithPrefix(dict: Record<string, string>): string[] {
  return Object.keys(dict).filter((k) => PREFIXES.some((p) => k.startsWith(p))).sort();
}

describe('regulation and load-generation i18n', () => {
  it('has the same key set in both required locales', () => {
    expect(keysWithPrefix(es)).toEqual(keysWithPrefix(en));
  });

  it('added a non-trivial number of keys', () => {
    expect(keysWithPrefix(en).length).toBeGreaterThanOrEqual(180);
  });

  it('never leaves a value empty or equal to its key', () => {
    for (const dict of [en, es]) {
      for (const k of keysWithPrefix(dict)) {
        expect(dict[k], k).toBeTruthy();
        expect(dict[k], k).not.toBe(k);
      }
    }
  });

  it('keeps the same placeholders on both sides of a translation', () => {
    // A dropped {mm} would silently print the wrong sentence rather than fail.
    const ph = (v: string) => (v.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of keysWithPrefix(en)) {
      expect(ph(es[k]), k).toEqual(ph(en[k]));
    }
  });

  it('states in both locales that the assumed aggregate is not a regulatory default', () => {
    // The single most important sentence in this set: it is what stops a reviewer
    // reading 20 mm as something the code prescribes.
    expect(en['codes.aggregateAssumedWarning']).toMatch(/NOT a regulatory default/);
    expect(es['codes.aggregateAssumedWarning']).toMatch(/NO un valor por defecto reglamentario/);
  });

  it('warns in both locales that changing edition invalidates stored results', () => {
    expect(en['codes.migration.editionChanged']).toMatch(/no longer comparable/);
    expect(es['codes.migration.editionChanged']).toMatch(/ya no son comparables/);
  });
});
