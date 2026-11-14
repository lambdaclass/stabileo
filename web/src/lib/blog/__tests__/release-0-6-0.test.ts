import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPost, type Block } from '..';

const locales = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const repo = 'https://github.com/lambdaclass/stabileo/blob/main';
const selectedVersions = ['50', '52', '53', '54', '56', '58', '59', '61', '63', '65', '66', '67', '68', '69', '71', '72', '73', '75', '76', '78'];

function notes(locale: typeof locales[number]): string {
  return readFileSync(new URL(`../../../../../docs/releases/v0.6.0${locale === 'en' ? '' : `.${locale}`}.md`, import.meta.url), 'utf8');
}

function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)(?= \p{Lu})/gu, '$1.').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replaceAll('**', '');
}

function tables(blocks: Block[]) {
  return blocks.filter((block) => block.k === 'table');
}

describe('0.6.0 release article', () => {
  it('is published after 0.5.0 in every language that article offers', () => {
    const previous = findPost('stabileo-0-5-0')!;
    const post = findPost('stabileo-0-6-0');
    expect(post).toBeDefined();
    expect(Object.keys(post!.i18n).sort()).toEqual(Object.keys(previous.i18n).sort());
    expect(post!.order).toBeGreaterThan(previous.order);
    expect(post!.date).toBe('2026-11-14');
  });

  it.each(locales)('%s leads with the release action and preserves every advisory’s scope, severity and action', (locale) => {
    const body = findPost('stabileo-0-6-0')?.i18n[locale];
    expect(body).toBeDefined();
    const sections = notes(locale).split(/^## /m);
    expect(body!.blocks[0]).toEqual({ k: 'p', t: plain(sections[1].trim().split('\n\n')[1]) });
    expect(body!.blocks[1]).toEqual({ k: 'note', t: plain(sections[2].trim().split('\n\n')[1]) });
    const expected = sections[2].split('\n').filter((line) => /^\| \[SA-/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => plain(cell.trim())));
    const advisoryTable = tables(body!.blocks)[0];
    expect(expected).toHaveLength(16);
    expect(advisoryTable.rows).toEqual(expected);
    expect(advisoryTable.rows.map((row) => row[0]))
      .toEqual(Array.from({ length: 16 }, (_, index) => `SA-2026-${String(index + 48).padStart(3, '0')}`));
    expect(body!.blocks[1].k === 'note' && body!.blocks[1].t).toContain('SA-2026-056');
  });

  it.skip.each(locales)('known wrong result: #2087 — %s separates selected new numerical changes from the two later notices for 0.5.0', (locale) => {
    const body = findPost('stabileo-0-6-0')?.i18n[locale];
    expect(body).toBeDefined();
    const release = notes(locale);
    const articleTables = tables(body!.blocks);
    expect(articleTables).toHaveLength(3);
    const selected = articleTables[1];
    expect(selected.rows.map((row) => row[0])).toEqual(selectedVersions);
    const sourceRows = release.split('\n').filter((line) => /^\| \d+ \|/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => plain(cell.trim())));
    for (const row of selected.rows) expect(sourceRows).toContainEqual(row);
    expect(articleTables[2].rows).toEqual(sourceRows.slice(-2));
    const prose = JSON.stringify(body);
    expect(prose).toContain('49');
    expect(prose).toContain('78');
    expect(body!.blocks.filter((block) => block.k === 'ext').map((block) => block.href))
      .toContain(`${repo}/docs/releases/v0.6.0${locale === 'en' ? '' : `.${locale}`}.md`);
  });

  it.each(locales)('%s retains all known limitations and keeps infrastructure out of the article', (locale) => {
    const body = findPost('stabileo-0-6-0')?.i18n[locale];
    expect(body).toBeDefined();
    const limitations = notes(locale).split(/^## /m).at(-1)!;
    const items = limitations.split('\n').filter((line) => line.startsWith('- ')).map((line) => plain(line.slice(2)));
    expect(body!.blocks).toContainEqual({ k: 'ul', items });
    expect(JSON.stringify(body)).not.toMatch(/quinn|rustix|RUSTSEC|Revert Check|\bworkflow\b|reviewer|pull request/i);
  });
});
