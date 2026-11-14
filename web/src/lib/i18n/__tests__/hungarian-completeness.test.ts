import { describe, expect, it } from 'vitest';
import main from '../locales/hu';
import steel from '../locales/steel/hu';
import steps from '../locales/steps/hu';
import full from '../locales/full/hu';
import browser from '../locales/browser/hu';
import { ALL_DICTS, completeLocales } from '../locales/all';
import { STANDING_PAGES } from '../../blog/pages';

const emptyPluralEndings = new Set(['kin.plural_s', 'kin.plural_n']);

const dictionaries = [
  ['source', { ...main, ...steel, ...steps }],
  ['Node', { ...full, ...steps }],
  ['browser', { ...browser, ...steps }],
  ['coverage', ALL_DICTS.hu],
] as const;

describe('Hungarian completeness', () => {
  it.each(dictionaries)('known wrong result: #2081 supplies every English key through the %s dictionary', (_name, dict) => {
    expect(completeLocales()).toContain('hu');
    const missing = Object.keys(ALL_DICTS.en).filter((key) => {
      if (emptyPluralEndings.has(key)) return dict[key] !== '';
      return typeof dict[key] !== 'string' || !dict[key].trim() || dict[key] === key;
    });
    expect(missing).toEqual([]);
  });

  it.each(['/terms', '/privacy', '/usage-data'])('known wrong result: #2081 supplies Hungarian content for %s', (path) => {
    const page = STANDING_PAGES.find((page) => page.path === path)!;
    const hu = page.i18n.hu!;
    expect(hu).toBeDefined();
    expect(hu.title.trim()).not.toBe('');
    expect(hu.title).not.toBe(page.i18n.en.title);
    expect(hu.lead.trim()).not.toBe('');
    expect(hu.blocks.length).toBe(page.i18n.en.blocks.length);
    expect(hu.blocks.map((block) => block.k)).toEqual(page.i18n.en.blocks.map((block) => block.k));
    for (const [index, block] of hu.blocks.entries()) {
      const reference = page.i18n.en.blocks[index];
      if (block.k === 'ul' && reference.k === 'ul') {
        expect(block.items.length).toBe(reference.items.length);
        for (const [item, text] of block.items.entries()) {
          expect(text.trim()).not.toBe('');
          expect(text).not.toBe(reference.items[item]);
        }
      } else if ('t' in block && 't' in reference) {
        expect(block.t.trim()).not.toBe('');
        if (index !== 1) expect(block.t).not.toBe(reference.t);
      }
    }
  });

  it.each(dictionaries)('retains an existing translation through the %s dictionary', (_name, dict) => {
    expect(dict['plates.kindHead']).toBe('Fajta');
    expect(dict['kin.plural_s']).toBe('');
    expect(dict['kin.plural_n']).toBe('');
  });
});
