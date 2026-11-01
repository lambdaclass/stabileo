import { afterEach, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ExperimentShell from '../ExperimentShell.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import { EXPERIMENTS } from '../../experiments';
import { finalReview, reviewCount } from '../../reviews';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
const empty = createRawSnippet(() => ({ render: () => '<p></p>' }));
const header = (paperId: string) => render(ExperimentShell, { props: { paperId, name: 'N', lead: 'L', sourcePath: 'x', actions: { goToStep: () => {}, setParams: () => {}, showTab: () => {} }, article: empty, app: empty } }).body;
const REVIEW_NOTE = /First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|review rounds?\b|rondas? de revisión|rodadas? de revisão|Prüfrunden?|cycles? de revue|inceleme turu/;

it('shows no first-version or review-round note in any paper header, while the catalogue keeps the records', () => {
  expect(finalReview('mattiasson-elastica')).toBe(true);
  expect(finalReview('newmark-1959')).toBe(false);
  expect(reviewCount('newmark-1959')).toBe(2);
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
    setLocale(locale);
    for (const e of EXPERIMENTS) {
      const body = header(e.paperId);
      expect(body, `${locale} ${e.paperId}`).not.toContain('rs-review');
      expect(body.replace(/<[^>]*>/g, ' '), `${locale} ${e.paperId}`).not.toMatch(REVIEW_NOTE);
    }
  }
});
