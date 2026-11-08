import { describe, expect, it } from 'vitest';
import { findPost, type Block } from '..';

function safetyTokens(text: string, locale: string): string[] {
  const grouping = new Intl.NumberFormat(locale).format(1000).charAt(1);
  const pattern = new RegExp(`\\b\\d{1,3}(?:${grouping === '.' ? '\\.' : grouping}\\d{3})+\\b`, 'g');
  const normalized = text.replace(pattern, (count) => count.split(grouping).join(''));
  return (normalized.match(/SA-\d{4}-\d{3}|#\d+|\d+(?:\.\d+){2,}|(?:(?<![\p{L}\p{N}_])[+−-])?\d+(?:[.,]\d+)?(?:\s*(?:[kMGTmunµμ]?(?:Hz|rad|s)|%)(?![\p{L}\p{N}_]))?|\b(?:Qa|MRd|Mz|mx|Iy|Iz|MITC4|MITC9)\b|P-Δ|Y–Z|X–Y|[+≤%]/gu) ?? [])
    .map((token) => {
      const quantity = token.match(/^([+−-]?)(\d+(?:[.,]\d+)?)(?:\s*(\S+))?$/u);
      return quantity
        ? `${quantity[1].replace('−', '-')}${Number(quantity[2].replace(',', '.'))}${quantity[3] ?? ''}`
        : token;
    }).sort();
}

function safetyData(block: Block, locale = 'en') {
  if (block.k === 'table') {
    return {
      caption: safetyTokens(block.caption, locale),
      head: block.head.map((cell) => safetyTokens(cell, locale)),
      rows: block.rows.map((row) => row.map((cell) => safetyTokens(cell, locale))),
    };
  }
  const prose = block.k === 'ul' || block.k === 'ol'
      ? block.items
      : block.k === 'img' || block.k === 'photo'
        ? [block.alt, block.caption]
        : block.k === 'embed'
          ? [block.label, block.query]
          : block.k === 'ext'
            ? [block.t, block.label, block.href]
            : block.k === 'link'
              ? [block.t, block.slug]
              : [block.t];
  return prose.flatMap((text) => safetyTokens(text, locale)).sort();
}

describe('0.5.0 release notes in the newly offered languages', () => {
  it.each(['de', 'fr', 'tr'] as const)('%s preserves every block and its safety data', (locale) => {
    const post = findPost('stabileo-0-5-0')!;
    const body = post.i18n[locale];
    expect(body, `${locale}: missing release notes`).toBeDefined();
    expect(body!.title).not.toBe(post.i18n.en.title);
    expect(body!.excerpt).not.toBe(post.i18n.en.excerpt);
    expect(body!.blocks.map((block) => block.k)).toEqual(post.i18n.en.blocks.map((block) => block.k));
    body!.blocks.forEach((block, index) => {
      expect(safetyData(block, locale), `${locale}: block ${index}`).toEqual(safetyData(post.i18n.en.blocks[index]));
      const source = post.i18n.en.blocks[index];
      if (block.k === 'ext' && source.k === 'ext') expect(block.href).toBe(source.href);
      if (block.k === 'link' && source.k === 'link') expect(block.slug).toBe(source.slug);
    });
  });

  it.each(['de', 'fr', 'tr'] as const)('%s writes integer counts with local grouping and preserves their values', (locale) => {
    const post = findPost('stabileo-0-5-0')!;
    const grouping = new Intl.NumberFormat(locale).format(1000).charAt(1);
    const pattern = new RegExp(`\\b\\d{1,3}(?:${grouping === '.' ? '\\.' : grouping}\\d{3})+\\b`, 'g');
    const sourceCounts = JSON.stringify(post.i18n.en.blocks).match(/\b\d{1,3}(?:,\d{3})+\b/g)!;
    const localCounts = JSON.stringify(post.i18n[locale]!.blocks).match(pattern) ?? [];
    expect(sourceCounts.length).toBeGreaterThan(0);
    expect(localCounts.map((count) => Number(count.split(grouping).join(''))))
      .toEqual(sourceCounts.map((count) => Number(count.replaceAll(',', ''))));
  });

  it.each(['de', 'fr', 'tr'] as const)('%s rejects magnitudes swapped between advisories', (locale) => {
    const post = findPost('stabileo-0-5-0')!;
    const source = post.i18n.en.blocks.find((block) => block.k === 'table')!;
    const table = structuredClone(post.i18n[locale]!.blocks.find((block) => block.k === 'table')!);
    const first = table.rows[0][2].match(/\d+ %/)![0];
    const second = table.rows[1][2].match(/\d+ %/)![0];
    table.rows[0][2] = table.rows[0][2].replace(first, second);
    table.rows[1][2] = table.rows[1][2].replace(second, first);
    expect(() => expect(safetyData(table, locale)).toEqual(safetyData(source))).toThrow();
  });
});

describe('0.5.0 release-note review regressions', () => {
  it.each([
    ['en', 'German, French and Turkish are offered again.'],
    ['es', 'El alemán, el francés y el turco vuelven a estar disponibles.'],
    ['pt', 'Alemão, francês e turco voltam a ser oferecidos.'],
    ['de', 'Deutsch, Französisch und Türkisch werden wieder angeboten.'],
    ['fr', 'L’allemand, le français et le turc sont à nouveau proposés.'],
    ['tr', 'Almanca, Fransızca ve Türkçe yeniden sunuluyor.'],
  ] as const)('%s describes the languages as available again', (locale, wording) => {
    const post = findPost('stabileo-0-5-0')!;
    const blockIndex = post.i18n.en.blocks.findIndex((block) =>
      block.k === 'ul' && block.items.some((item) => item.startsWith('German, French and Turkish')));
    expect(blockIndex).toBeGreaterThanOrEqual(0);
    const source = post.i18n.en.blocks[blockIndex];
    const translated = post.i18n[locale]!.blocks[blockIndex];
    expect(source.k).toBe('ul');
    expect(translated.k).toBe('ul');
    if (source.k !== 'ul' || translated.k !== 'ul') throw new Error('Missing release feature list');
    const itemIndex = source.items.findIndex((item) => item.startsWith('German, French and Turkish'));
    expect(translated.items[itemIndex]).toBe(wording);
  });

  it.each(['de', 'fr', 'tr'] as const)('%s writes every decimal value with a decimal comma', (locale) => {
    const post = findPost('stabileo-0-5-0')!;
    const source = JSON.stringify(post.i18n.en.blocks);
    const translated = JSON.stringify(post.i18n[locale]!.blocks);
    const decimals = source.match(/(?<![\d.])\d+\.\d+(?![\d.])/g)!;
    expect(decimals.length).toBeGreaterThan(0);
    expect(translated.match(/\d+,\d+/g) ?? [])
      .toEqual(decimals.map((value) => new Intl.NumberFormat(locale, { useGrouping: false }).format(Number(value))));
    expect(safetyTokens(translated, locale)).toEqual(safetyTokens(source, 'en'));
  });

  describe.each(['de', 'fr', 'tr'] as const)('%s signed quantities and units', (locale) => {
    it.each([
      ['unit prefix', (quantity: string) => quantity.replace('Hz', 'kHz')],
      ['missing unit', (quantity: string) => quantity.replace('Hz', '')],
      ['minus sign', (quantity: string) => `-${quantity}`],
      ['Unicode minus sign', (quantity: string) => `−${quantity}`],
    ] as const)('rejects a changed %s in an advisory', (_, mutate) => {
      const post = findPost('stabileo-0-5-0')!;
      const source = post.i18n.en.blocks.find((block) => block.k === 'table')!;
      const table = structuredClone(post.i18n[locale]!.blocks.find((block) => block.k === 'table')!);
      const sourceRow = source.rows.find((row) => /\d+\.\d+ Hz/.test(row[2]))!;
      const row = table.rows.find((row) => row[0] === sourceRow[0])!;
      const quantity = row[2].match(/\d+[.,]\d+ Hz/)![0];
      row[2] = row[2].replace(quantity, mutate(quantity));
      expect(() => expect(safetyData(table, locale)).toEqual(safetyData(source))).toThrow();
    });
  });
});
