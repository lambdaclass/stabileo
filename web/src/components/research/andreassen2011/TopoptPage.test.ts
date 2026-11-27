import { expect, it } from 'vitest';
import { parse } from 'svelte/compiler';
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
          const nodes = parse(cells[column], { modern: true }).fragment.nodes;
          type Nodes = typeof nodes;
          const contents = (items: Nodes): string => items.map(n => n.type === 'Text' ? n.data : n.type === 'RegularElement' ? contents(n.fragment.nodes) : '').join('');
          const exponents: string[] = [];
          function visit(items: Nodes) {
            for (const n of items) if (n.type === 'RegularElement') {
              if (n.name === 'sup') exponents.push(contents(n.fragment.nodes));
              visit(n.fragment.nodes);
            }
          }
          visit(nodes);
          expect(contents(nodes).trim()).toBe(plain ? num(v, { sig: 3 }) : `${mantissa} × 10${exp}`);
          expect(exponents).toEqual(plain ? [] : [exp]);
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
