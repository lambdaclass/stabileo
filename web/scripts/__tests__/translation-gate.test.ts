import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkTranslations, formatFailures, isMovedPage, segments } from '../translation-gate';

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

  it('fails a block whose translated lead is followed by the English text', () => {
    const es = { ...ES, blocks: [...ES.blocks.slice(0, 3), `Una introducción traducida. ${EN.blocks[3]} ${EN.blocks[2]}`] };
    const failures = gate(site({ '/en/': EN, '/es/': es }));
    expect(failures.map((f) => f.offending)).toEqual([[es.blocks[3]]]);
    const prefixed = { ...ES, blocks: ES.blocks.map((b, i) => (i === 0 ? `Nota: ${EN.blocks[0]}` : b)) };
    expect(gate(site({ '/en/': EN, '/es/': prefixed })).map((f) => f.offending)).toEqual([[prefixed.blocks[0]]]);
    const repeated = { ...ES, blocks: [...ES.blocks.slice(0, 3), `${ES.blocks[3]} ${Array(30).fill(EN.blocks[3]).join(' ')}`] };
    const repeatedFailures = gate(site({ '/en/': EN, '/es/': repeated }));
    expect(repeatedFailures.map((f) => f.offending)).toEqual([[repeated.blocks[3]]]);
    expect(repeatedFailures[0].rule).toMatch(/^1\/4 text blocks \(25\.0%, [5-9]\d\.\d% of characters\)/);
    const mixed = { ...ES, blocks: ES.blocks.map((b, i) => `${b} ${b} ${EN.blocks[i]}`) };
    const mixedFailures = gate(site({ '/en/': EN, '/es/': mixed }));
    expect(mixedFailures).toHaveLength(1);
    expect(mixedFailures[0].rule).toMatch(/^0\/4 text blocks \(0\.0%, [1-9]\d\.\d% of characters\)/);
    expect(mixedFailures[0].offending).toEqual(mixed.blocks);
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

  it('fails an x-default that is missing, repeated or not this page in English', () => {
    const DEFAULT = `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/">`;
    for (const [replacement, declared] of [
      ['', '(none)'],
      [DEFAULT + DEFAULT, `x-default ${ORIGIN}/en/, x-default ${ORIGIN}/en/`],
      [`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/en/blog/">`, `x-default ${ORIGIN}/en/blog/`],
    ]) {
      const d = site({ '/en/': EN, '/es/': ES });
      const file = join(d, 'es', 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace(DEFAULT, replacement));
      const failures = gate(d).filter((f) => f.rule === 'x-default is not the single English version of this page');
      expect(failures).toEqual([{ page: '/es/', locale: 'es', rule: 'x-default is not the single English version of this page', offending: [`declared: ${declared}`, `expected: x-default ${ORIGIN}/en/`] }]);
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('fails a site with no English pages at all instead of passing on nothing', () => {
    expect(gate(site({}, [])).map((f) => f.rule)).toEqual(['no English pages were built']);
  });

  it('leaves out what a page declares untranslatable or written in another language, and nothing else', () => {
    const html = '<div id="prerender"><div lang="en"><div><p>An English abstract kept in English</p></div></div><p translate="no">δmax = PL³/(3EI) wL EI</p><p lang="es-AR">Un párrafo en castellano propio</p><p>The text after them stays here</p></div><div id="app">';
    expect(segments(html, 'es')).toEqual(['Un párrafo en castellano propio', 'The text after them stays here']);
    expect(segments(html, 'en')).toEqual(['An English abstract kept in English', 'The text after them stays here']);
  });

  it('still fails English the page does not declare as English', () => {
    const es = { ...ES, blocks: [...ES.blocks.slice(0, 3), EN.blocks[3]] };
    const failures = gate(site({ '/en/': EN, '/es/': es }));
    expect(failures.map((f) => f.offending)).toEqual([[EN.blocks[3]]]);
  });

  it('segments block text of four words or more, leaving out code and markup', () => {
    expect(segments('<div id="prerender"><p>One <strong>two</strong> three four</p><p>too short here</p><pre>let a = b + c + d</pre><li>a b c d e</li></div><div id="app">')).toEqual(['One two three four']);
  });
});

describe('pages left at a moved address', () => {
  it('are not built pages: no hreflang, no sitemap entry and no English twin are asked of them', async () => {
    const { redirectPage } = await import('../redirect-page');
    const d = site({ '/en/': EN, '/es/': ES });
    for (const locale of ['en', 'es'] as const) {
      const file = join(d, locale, 'examples', 'beam-frame', 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, redirectPage(ORIGIN, locale, '/examples/beam-frame'));
      expect(isMovedPage(readFileSync(file, 'utf8'))).toBe(true);
    }
    expect(gate(d)).toEqual([]);
  });

  it('only a noindex page with an immediate refresh counts as moved', () => {
    expect(isMovedPage(html(EN, '/'))).toBe(false);
    expect(isMovedPage('<html><head><meta name="robots" content="noindex"><title>x</title></head></html>')).toBe(false);
  });
});
