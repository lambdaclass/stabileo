import { afterEach, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import ExperimentShell from '../ExperimentShell.svelte';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import { EXPERIMENTS } from '../../experiments';
import { reviewCount } from '../../reviews';
import { translations as cqc } from '../../cqc1981/strings';
import { strings as dadeppo } from '../../dadeppo1975/i18n';
import { strings as lee } from '../../lee1968/i18n';
import { strings as navier } from '../../navier1823/strings';
import { translations as newmark } from '../../newmark1959/i18n';
import { strings as plastic } from '../../plastic-collapse/i18n';

const original = publicI18n.locale;
afterEach(() => setLocale(original));
const empty = createRawSnippet(() => ({ render: () => '<p></p>' }));
const header = (paperId: string) => render(ExperimentShell, { props: { paperId, name: 'N', lead: 'L', sourcePath: 'x', actions: { goToStep: () => {}, setParams: () => {}, showTab: () => {} }, article: empty, app: empty } }).body;
const REVIEW_NOTE = /First version|Primera versión|Primeira versão|Erste Version|Première version|İlk sürüm|review rounds?\b|rondas? de revisión|rodadas? de revisão|Prüfrunden?|cycles? de revue|inceleme turu|Első változat|felülvizsgálati köre?\b/;

it('shows no first-version or review-round note in any paper header, while the catalogue keeps the records', () => {
  expect(reviewCount('mattiasson-elastica')).toBe(3);
  expect(reviewCount('newmark-1959')).toBe(2);
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu']) {
    setLocale(locale);
    for (const e of EXPERIMENTS) {
      const body = header(e.paperId);
      expect(body, `${locale} ${e.paperId}`).not.toContain('rs-review');
      expect(body.replace(/<[^>]*>/g, ' '), `${locale} ${e.paperId}`).not.toMatch(REVIEW_NOTE);
    }
  }
});

it('keeps no first-version or review-round text in the article strings of any page, in any locale', () => {
  for (const [page, table] of Object.entries({ cqc, dadeppo, lee, navier, newmark, plastic })) {
    for (const [locale, strings] of Object.entries(table as Record<string, unknown>)) {
      expect(JSON.stringify(strings), `${page} ${locale}`).not.toMatch(REVIEW_NOTE);
      expect(strings, `${page} ${locale}`).not.toHaveProperty('stage');
    }
  }
});
