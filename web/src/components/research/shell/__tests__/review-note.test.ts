import { afterEach, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ExperimentShell from '../ExperimentShell.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import { finalReview, reviewLabel } from '../../reviews';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
const empty = createRawSnippet(() => ({ render: () => '<p></p>' }));
const header = (paperId: string) => render(ExperimentShell, { props: { paperId, name: 'N', lead: 'L', sourcePath: 'x', actions: { goToStep: () => {}, setParams: () => {}, showTab: () => {} }, article: empty, app: empty } }).body;

it('omits the review-round note from the page header once the catalogue marks the final review', () => {
  expect(finalReview('mattiasson-elastica')).toBe(true);
  expect(finalReview('newmark-1959')).toBe(false);
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    setLocale(locale);
    expect(header('mattiasson-elastica')).not.toContain('rs-review');
    expect(header('mattiasson-elastica')).not.toContain(reviewLabel('mattiasson-elastica', locale));
    expect(header('newmark-1959')).toMatch(new RegExp(`class="rs-review[^"]*">${reviewLabel('newmark-1959', locale)}<`));
  }
});
