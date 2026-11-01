import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkTranslations, englishFallbacks, formatFailures, segments } from '../translation-gate';
import { i18n, setLocale, t } from '../../src/lib/i18n/store.svelte';

const ORIGIN = 'https://stabileo.com';
const LOCALES = ['en', 'es'] as const;

type Page = { lang: string; title: string; description: string; blocks: string[]; alternates: string[] };

const EN: Page = {
  lang: 'en',
  title: 'Structural analysis in the browser — Stabileo',
  description: 'Model a frame, solve it and read every number back in seconds.',
  blocks: [
    'Stabileo solves frames, trusses and shells with a verified engine.',
    'Every result carries the checks it passed and the ones it did not.',
    'Open a model, change a load and watch the diagrams follow along.',
    'The same model gives the same numbers on every machine we test.',
  ],
  alternates: ['en', 'es'],
};
const ES: Page = {
  lang: 'es',
  title: 'Análisis estructural en el navegador — Stabileo',
  description: 'Modelá un pórtico, resolvelo y leé cada número en segundos.',
  blocks: [
    'Stabileo resuelve pórticos, reticulados y cáscaras con un motor verificado.',
    'Cada resultado lleva las verificaciones que pasó y las que no.',
    'Abrí un modelo, cambiá una carga y mirá cómo lo siguen los diagramas.',
    'El mismo modelo da los mismos números en cada máquina que probamos.',
  ],
  alternates: ['en', 'es'],
};

function html(p: Page, path: string): string {
  const links = p.alternates.map((l) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${path}">`).join('');
  return `<!doctype html><html lang="${p.lang}"><head><title>${p.title}</title><meta name="description" content="${p.description}"><meta property="og:title" content="${p.title}"><meta property="og:description" content="${p.description}">${links}<link rel="alternate" hreflang="x-default" href="${ORIGIN}/en${path}"></head><body><div id="prerender"><main>${p.blocks.map((b) => `<p>${b}</p>`).join('')}</main></div><div id="app"></div></body></html>`;
}

let dist: string;
afterEach(() => rmSync(dist, { recursive: true, force: true }));

function site(pages: Record<string, Page>, sitemapPaths = Object.keys(pages)): string {
  dist = mkdtempSync(join(tmpdir(), 'translation-gate-'));
  for (const [path, page] of Object.entries(pages)) {
    const file = join(dist, path, 'index.html');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html(page, path.slice(3)));
  }
  const entries = sitemapPaths.map((path) => {
    const page = pages[path] ?? EN;
    const rest = path.slice(3);
    const alts = page.alternates.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${rest}"/>`).join('');
    return `<url><loc>${ORIGIN}${path}</loc>${alts}<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/en${rest}"/></url>`;
  });
  writeFileSync(join(dist, 'sitemap.xml'), `<urlset>${entries.join('')}</urlset>`);
  return dist;
}

const gate = (d: string) => checkTranslations(d, ORIGIN, LOCALES);

describe('translation gate', () => {
  it('passes a translated site whose sitemap and hreflang agree with the files', () => {
    expect(formatFailures(gate(site({ '/en/': EN, '/es/': ES })))).toBe('');
  });

  it('fails a page that is the English one under another language', () => {
    const failures = gate(site({ '/en/': EN, '/es/': { ...EN, lang: 'es' } }));
    expect(failures.map((f) => [f.page, f.locale])).toEqual([['/es/', 'es'], ['/es/', 'es']]);
    expect(failures[1].rule).toMatch(/^4\/4 text blocks .* are the English page's text/);
    expect(failures[1].offending).toEqual(EN.blocks);
  });

  it('fails one English block in twenty, counting characters as well as blocks', () => {
    const many = (prefix: string) => Array.from({ length: 20 }, (_, i) => `${prefix} bloque número ${i} con texto propio`);
    const en = { ...EN, blocks: [...many('English'), 'A single long English paragraph that was never translated into Spanish at all, '.repeat(4)] };
    const es = { ...ES, blocks: [...many('Español'), en.blocks.at(-1)!] };
    const failures = gate(site({ '/en/': en, '/es/': es }));
    expect(failures).toHaveLength(1);
    expect(failures[0].rule).toMatch(/^1\/21 text blocks \(4\.8%, \d+\.\d% of characters\)/);
  });

  it('fails an English title on a Spanish page, naming the string', () => {
    const failures = gate(site({ '/en/': EN, '/es/': { ...ES, title: EN.title } }));
    expect(failures).toEqual([
      { page: '/es/', locale: 'es', rule: 'head strings are missing or the English ones', offending: [`title: ${EN.title}`, `ogTitle: ${EN.title}`] },
    ]);
  });

  it('fails a page whose <html lang> is not its language', () => {
    const failures = gate(site({ '/en/': EN, '/es/': { ...ES, lang: 'en' } }));
    expect(failures.map((f) => f.rule)).toEqual(['<html lang> is not the page language']);
  });

  it('fails a sitemap entry for a page that was not built', () => {
    const failures = gate(site({ '/en/': { ...EN, alternates: ['en'] } }, ['/en/', '/es/']));
    expect(failures).toContainEqual({ page: '/sitemap.xml', locale: '-', rule: 'sitemap lists pages that were not built', offending: ['/es/'] });
  });

  it('fails a built page the sitemap leaves out', () => {
    const failures = gate(site({ '/en/': EN, '/es/': ES }, ['/en/']));
    expect(failures).toContainEqual({ page: '/sitemap.xml', locale: '-', rule: 'built pages missing from the sitemap', offending: ['/es/'] });
  });

  it('fails an hreflang alternate for a language the page was not built in', () => {
    const failures = gate(site({ '/en/blog/x/': EN }));
    expect(failures.map((f) => f.rule)).toContain('page hreflang set is not the set of languages the page was built in');
  });

  it('fails a site with no English pages at all instead of passing on nothing', () => {
    expect(gate(site({}, [])).map((f) => f.rule)).toEqual(['no English pages were built']);
  });

  it('segments block text of four words or more, leaving out code and markup', () => {
    expect(segments('<div id="prerender"><p>One <strong>two</strong> three four</p><p>too short here</p><pre>let a = b + c + d</pre><li>a b c d e</li></div><div id="app">')).toEqual(['One two three four']);
  });
});

describe('English fallbacks', () => {
  it('records a key the page language lacks, and nothing for a key it has', () => {
    const misses: string[] = [];
    const before = i18n.locale;
    (globalThis as { __i18nMisses?: string[] }).__i18nMisses = misses;
    try {
      setLocale('es');
      t('landing.no-such-key-for-the-gate');
      t('lang.es');
    } finally {
      delete (globalThis as { __i18nMisses?: string[] }).__i18nMisses;
      setLocale(before);
    }
    expect(misses).toEqual(['es landing.no-such-key-for-the-gate']);
    expect(englishFallbacks('es', misses)).toEqual(['landing.no-such-key-for-the-gate']);
  });

  it('turns a page\'s misses into the keys its language fell back on', () => {
    expect(englishFallbacks('es', ['es landing.b', 'es landing.a', 'es landing.a', 'de landing.c'])).toEqual(['landing.a', 'landing.b']);
    expect(englishFallbacks('en', ['en landing.a'])).toEqual([]);
  });
});
