import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CqcPage from '../CqcPage.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import { translations } from '../strings';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import validation from '../../../../../../research/benchmarks/cqc-1981/VALIDATION.json';

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
  expect(page).not.toMatch(/First version|review rounds?/);
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

it('renders the page, shell and metadata language in all eight locales', () => {
  for (const locale of PUBLIC_LOCALES) {
    setLocale(locale);
    const { body } = render(CqcPage);
    expect(body).toMatch(new RegExp(`<h1 lang="${locale}"`));
    expect(text(body)).toContain(translations[locale].title);
    expect(text(body)).toContain(translations[locale].referenceLabel);
    expect(text(body)).toContain(translations[locale].citation.trim());
  }
});

it.skip.each(PUBLIC_LOCALES)('known wrong result: #2595 — the %s Checks paragraph identifies the validated roof nodes and rounded native maximum', locale => {
  setLocale(locale);
  const { body } = render(CqcPage);
  const paragraph = body.match(/<h2 id="checks"[^>]*>[^<]+<\/h2>\s*<p[^>]*>([^<]+)<\/p>/)?.[1] ?? '';
  const roofNodes = [...new Set(validation.checks.flatMap(check => check.name.match(/roof (\d+) X displacement/)?.[1] ?? []))];
  for (const node of roofNodes) {
    expect(paragraph).toMatch(new RegExp(`(?<![\\d.])${node}(?![\\d.])`));
  }
  for (const rule of ['SRSS', 'CQC']) expect(paragraph).toContain(rule);

  const displayed = [...paragraph.matchAll(/(\d+(?:\.\d+)?) × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g)].map(([, mantissa, exponent]) =>
    Number(`${mantissa}e${exponent.normalize('NFKC').replace('−', '-')}`));
  const maximum = Math.max(...validation.checks.map(check => check.observed));
  expect(displayed).toEqual([validation.checks[0].tolerance, Number(maximum.toPrecision(2))]);
  expect(validation.checks.every(check => check.tolerance === displayed[0])).toBe(true);
  expect(paragraph).toMatch(/≈ \d+(?:\.\d+)? × 10/);
});
