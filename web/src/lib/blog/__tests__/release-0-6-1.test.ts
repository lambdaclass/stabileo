import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findPost } from '..';

const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'id'] as const;
const repo = 'https://github.com/lambdaclass/stabileo/blob/main';
const route = '/blog/stabileo-0-6-1';

function notes(locale: typeof locales[number]): string {
  return readFileSync(new URL(`../../../../../docs/releases/v0.6.1${locale === 'en' ? '' : `.${locale}`}.md`, import.meta.url), 'utf8');
}

function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replaceAll('**', '');
}

function rows(section: string): string[][] {
  return section.split('\n').filter(line => /^\| (?:\[SA-|\d+ \|)/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => plain(cell.trim())));
}

describe.each([false, true])('0.6.1 release article with research=%s', research => {
  const publishedLocales = [...locales, ...(research ? ['hu'] : [])].sort();

  beforeEach(() => {
    vi.stubGlobal('__PUBLIC_FEATURES__', { ...__PUBLIC_FEATURES__, research });
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('publishes after 0.6.0 in the same languages', async () => {
    const { findPost } = await import('..');
    const previous = findPost('stabileo-0-6-0')!;
    const post = findPost('stabileo-0-6-1');
    expect(post).toBeDefined();
    expect(Object.keys(post!.i18n).sort()).toEqual(publishedLocales);
    expect(Object.keys(post!.i18n).sort()).toEqual(Object.keys(previous.i18n).sort());
    expect(post!.order).toBeGreaterThan(previous.order);
    expect(post!.date).toBe('2026-11-15');
  });

  it('includes the article and publication date in prerender, feed and sitemap metadata', async () => {
    const { POST_DATE, POST_LASTMOD, publicPaths, writtenIn } = await import('../../../../scripts/public-paths');
    expect(await publicPaths()).toContain(route);
    expect(POST_DATE.get(route)).toBe('2026-11-15');
    expect(POST_LASTMOD.get(route)).toBe('2026-11-15');
    expect(writtenIn(route).sort()).toEqual(publishedLocales);
  });
});

describe('0.6.1 release article', () => {
  it.each(locales)('%s leads with rechecking members and regenerating snow, preserving all five fixed advisories', locale => {
    const body = findPost('stabileo-0-6-1')?.i18n[locale];
    expect(body).toBeDefined();
    const sections = notes(locale).split(/^## /m);
    expect(body!.title).toBe(notes(locale).split('\n')[0].slice(2));
    const action = plain(sections[1].trim().split('\n\n')[1]);
    // Chinese ends a sentence with 。 and no space.
    expect(body!.excerpt).toBe(action.split(/(?<=\.) |(?<=。)/).slice(0, 2).join(locale === 'zh' ? '' : ' '));
    expect(body!.blocks[0]).toEqual({ k: 'p', t: plain(sections[1].trim().split('\n\n')[1]) });
    expect(body!.blocks[1]).toEqual({ k: 'note', t: plain(sections[2].trim().split('\n\n')[1]) });
    const expected = rows(sections[2]);
    expect(expected.map(row => row[0])).toEqual(['SA-2026-064', 'SA-2026-065', 'SA-2026-066', 'SA-2026-067', 'SA-2026-068']);
    expect(body!.blocks.filter(block => block.k === 'table')[0].rows).toEqual(expected);
  });

  it.each(locales)('%s includes every results-change notice and opens the matching localized release notes', locale => {
    const body = findPost('stabileo-0-6-1')?.i18n[locale];
    expect(body).toBeDefined();
    const expected = rows(notes(locale).split(/^## /m)[3]);
    expect(expected).toHaveLength(24);
    expect(expected.map(row => row[0])).toEqual([...Array(11).fill('79'), ...Array(13).fill('80')]);
    const tables = body!.blocks.filter(block => block.k === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[1].rows).toEqual(expected);
    const links = body!.blocks.filter(block => block.k === 'ext').map(block => block.href);
    const localizedNotes = `${repo}/docs/releases/v0.6.1${locale === 'en' ? '' : `.${locale}`}.md`;
    expect(links.filter(href => href.includes('/docs/releases/'))).toEqual([localizedNotes]);
    expect(links).toContain(`${repo}/docs/advisories/README.md`);
    expect(links).toContain(`${repo}/CHANGELOG.md`);
  });

  it.each(locales)('%s retains every open wrong-result issue and limitation without internal process claims', locale => {
    const body = findPost('stabileo-0-6-1')?.i18n[locale];
    expect(body).toBeDefined();
    const sections = notes(locale).split(/^## /m);
    const other = plain(sections[4].trim().split('\n\n')[1]).split(/(?<=\.) /).slice(0, 3).join(' ');
    expect(body!.blocks).toContainEqual({ k: 'p', t: other });
    const limitations = sections.at(-1)!;
    const items = limitations.split('\n').filter(line => line.startsWith('- ')).map(line => plain(line.slice(2)));
    expect(items).toHaveLength(5);
    expect(items[0].match(/#\d+/g)).toEqual(['#2096', '#2142', '#2143', '#2144']);
    expect(items[1]).toContain('SA-2026-056');
    expect(body!.blocks).toContainEqual({ k: 'ul', items });
    expect(JSON.stringify(body)).not.toMatch(/\bCI\b|continuous integration/);
    expect(JSON.stringify(body)).not.toMatch(/\binfra(?:structure)?\b|\breview counts?\b|\bpull requests?\b|\bworkflow\b|\bbenchmark\b|\bcache\b|\bmigration\b/i);
  });
});
