import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import TopoptPage from './TopoptPage.svelte';
import validation from '../../../../../research/optimization/andreassen-2011/VALIDATION.json';
import { text } from './i18n';
import { num } from '../shell/format';
import { publicI18n, setPublicLocale } from '../../../lib/i18n/store.svelte';
it('renders every evidence measurement, unchanged tolerance and translated rationale in all six locales', () => {
  const original = publicI18n.locale;
  try {
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
      setPublicLocale(locale);
      const body = render(TopoptPage).body.replace(/<!--.*?-->/g, '').replace(/ class="[^"]*"/g, '');
      expect(body).toContain(`<button disabled="">${text[locale].run}</button>`);
      for (const [i, check] of validation.checks.entries()) {
        const index = i < 12 ? i % 6 : i - 6;
        expect(body).toContain(text[locale].checkNames[index]);
        expect(body).toContain(`<td>${num(check.observed, { sig: 16 })}</td><td>${num(check.tolerance, { sig: 16 })}</td>`);
        expect(body).toContain(text[locale].reasons[index]);
        expect(check.observed).toBeLessThanOrEqual(check.tolerance);
      }
      expect(body).toContain(text[locale].model);
      expect(body).toContain(text[locale].rounding);
      expect(body).not.toMatch(/Questions for the authors|pending|provisional|not checked|full text not accessible/i);
    }
  } finally { setPublicLocale(original); }
});
