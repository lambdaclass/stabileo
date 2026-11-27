import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import TopoptPage from './TopoptPage.svelte';
import validation from '../../../../../research/optimization/andreassen-2011/VALIDATION.json';
import { text } from './i18n';
import { num, sci } from '../shell/format';
import { publicI18n, setPublicLocale } from '../../../lib/i18n/store.svelte';
import { PUBLIC_LOCALES } from '../../../lib/i18n/offered';
it('renders every evidence measurement, unchanged tolerance and translated rationale in all eight locales', () => {
  const original = publicI18n.locale;
  try {
    for (const locale of PUBLIC_LOCALES) {
      setPublicLocale(locale);
      const body = render(TopoptPage).body.replace(/<!--.*?-->/g, '').replace(/ class="[^"]*"/g, '');
      expect(body).toContain(`<button disabled="">${text[locale].run}</button>`);
      for (const [i, check] of validation.checks.entries()) {
        const index = i < 12 ? i % 6 : i - 6;
        const rows = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].filter(r => r[1].includes('<td>') && r[1].includes('<th'));
        const row = rows.slice(-validation.checks.length)[i][1];
        expect(row).toContain(text[locale].checkNames[index]);
        if (i < 12) expect(row).toContain(i < 6 ? text[locale].sensitivity : text[locale].density);
        const cells = [...row.matchAll(/<td>(.*?)<\/td>/gs)].map(m => m[1]);
        for (const [column, v] of [check.observed, check.tolerance].entries()) {
          const plain = v === 0 || (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6);
          const { mantissa, exp } = sci(v, 3);
          const content = cells[column].replace(/<\/?span(?: [^>]*)?>/g, '').trim();
          expect(content).toBe(plain ? num(v, { sig: 3 }) : `${mantissa}\u200a×\u200a10<sup>${exp}</sup>`);
        }
        expect(cells[2]).toBe(text[locale].reasons[index]);
        expect(check.observed).toBeLessThanOrEqual(check.tolerance);
      }
      expect(body).toContain(text[locale].model);
      expect(body).toContain(text[locale].rounding);
      expect(body).not.toMatch(/Questions for the authors|pending|provisional|not checked|full text not accessible/i);
    }
  } finally { setPublicLocale(original); }
});
