import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CqcPage from '../CqcPage.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import { translations } from '../strings';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

it('states what the result is checked against, with the evidence count and no pending items', () => {
  setLocale('en');
  const { body } = render(CqcPage);
  const page = text(body);
  expect(page).toContain('Against the closed form');
  expect(page).toContain('9 of 9 checks pass');
  expect(page).toContain(translations.en.publishedNote);
  expect(page).toContain('”, method illustration based on');
  expect(page).not.toContain('reproduction of');
  expect(page).toContain('First version · 2 review rounds');
  expect(page).not.toMatch(/Not yet|pending|not compared|Questions for the authors/i);
  expect(body.match(/Research, not a design tool/g)).toHaveLength(1);
  expect(body).toMatch(/<p class="source[^"]*" data-testid="cqc-source" role="status" aria-live="polite"/);
});

it('shows every number the page reports from the replay, in tables', () => {
  setLocale('en');
  const { body } = render(CqcPage);
  const cell = (id: string) => body.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))![1];
  expect(cell('result-SRSS')).toBe('14.387571');
  expect(cell('result-CQC')).toBe('17.549732');
  expect(cell('roof-5-SRSS')).toBe('10.676457');
  expect(cell('roof-5-CQC')).toBe('10.311059');
  expect(cell('roof-6-SRSS')).toBe('7.355556');
  expect(cell('roof-6-CQC')).toBe('7.859579');
  expect(cell('modal-0')).toBe('1.605897989');
  expect(cell('modal-1')).toBe('1.766467727');
  expect(cell('modal-2')).toBe('0.523274863');
  expect(cell('cqc-deficit')).toBe('−18.02');
});

it('renders the page, shell and metadata language in all six locales', () => {
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    setLocale(locale);
    const { body } = render(CqcPage);
    expect(body).toMatch(new RegExp(`<h1 lang="${locale}"`));
    expect(text(body)).toContain(translations[locale].title);
    expect(text(body)).toContain(translations[locale].referenceLabel);
    expect(text(body)).toContain(translations[locale].citation.trim());
  }
});
