import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PUBLIC_LOCALES } from '../../src/lib/i18n/offered';
import { RESEARCH_TOOLS_PATHS, searchMeta } from './research-tools';

/** Check the delivered files, including their crawlable text, after all captures/cards finish. */
export async function verifyResearchToolsOutput(dist: string) {
  const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
  const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
  if (/Disallow:\s*\/(?:research|tools|(?:en|es|pt|de|fr|tr)(?:\/|\s))/i.test(robots)) throw new Error('Research/Tools blocked by robots.txt');
  for (const locale of PUBLIC_LOCALES) for (const path of RESEARCH_TOOLS_PATHS) {
    const html = await readFile(join(dist, locale, path.slice(1), 'index.html'), 'utf8');
    const meta = searchMeta(path, locale);
    const fail = (message: string) => { throw new Error(`${locale}${path}: ${message}`); };
    const body = html.slice(html.indexOf('<body>'));
    const text = (s: string) => s.replace(/<[^>]*>/g, '').replace(/<!--.*?-->/g, '').trim();
    for (const tag of ['h1', 'h2', 'p']) {
      const matches = [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))];
      if (!matches.some(m => text(m[1]).length > 5)) fail(`missing crawlable ${tag} text`);
    }
    if ((html.match(/<title>/g) ?? []).length !== 1) fail('duplicate/missing title');
    if (!html.includes(`rel="canonical" href="${meta.canonical}"`)) fail('canonical');
    for (const alt of meta.alternates) if (!html.includes(`hreflang="${alt.hreflang}" href="${alt.href}"`)) fail('alternate');
    const entry = sitemap.split('<url>').find(s => s.includes(`<loc>${meta.canonical}</loc>`));
    if (!entry || !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(entry)) fail('sitemap/lastmod');
    for (const alt of meta.alternates) if (!entry!.includes(`hreflang="${alt.hreflang}" href="${alt.href}"`)) fail('sitemap alternate');
    await access(join(dist, new URL(meta.image).pathname.slice(1)));
  }
}
