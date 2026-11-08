import { afterEach, expect, it } from 'vitest';
import { paperTextLocale } from '../text-locale';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';

const original = publicI18n.locale;
afterEach(() => setLocale(original));

it('labels a paper in the reader’s language only where the paper is written in it', () => {
  setLocale('es');
  expect(paperTextLocale('shauer-2025')).toBe('es');
  expect(paperTextLocale('grossman-2026')).toBe('es');
  expect(paperTextLocale('ferrari-2025')).toBe('es');
  expect(paperTextLocale('shell-obstacle-course')).toBe('en');
  expect(paperTextLocale('no-such-paper')).toBe('en');
});
