import { describe, expect, it } from 'vitest';
import main from '../locales/hu';
import steel from '../locales/steel/hu';
import steps from '../locales/steps/hu';
import full from '../locales/full/hu';
import browser from '../locales/browser/hu';
import { ALL_DICTS, completeLocales } from '../locales/all';
import { STANDING_PAGES } from '../../blog/pages';

const dictionaries = [
  ['source', { ...main, ...steel, ...steps }],
  ['Node', { ...full, ...steps }],
  ['browser', { ...browser, ...steps }],
  ['coverage', ALL_DICTS.hu],
] as const;

describe('Hungarian completeness', () => {
  it.skip.each(dictionaries)('known wrong result: #2081 supplies every English key through the %s dictionary', (_name, dict) => {
    expect(completeLocales()).toContain('hu');
    const missing = Object.keys(ALL_DICTS.en).filter((key) => typeof dict[key] !== 'string' || !dict[key].trim() || dict[key] === key);
    expect(missing).toEqual([]);
  });

  it.skip.each(['/terms', '/privacy', '/usage-data'])('known wrong result: #2081 supplies Hungarian content for %s', (path) => {
    const page = STANDING_PAGES.find((page) => page.path === path)!;
    const hu = page.i18n.hu;
    expect(hu).toBeDefined();
    expect(hu.title.trim()).not.toBe('');
    expect(hu.title).not.toBe(page.i18n.en.title);
    expect(hu.lead.trim()).not.toBe('');
    expect(hu.body.length).toBe(page.i18n.en.body.length);
  });

  it.each(dictionaries)('retains an existing translation through the %s dictionary', (_name, dict) => {
    expect(dict['plates.kindHead']).toBe('Fajta');
  });
});
