import { describe, expect, it } from 'vitest';
import { findPost, type Block } from '..';

function safetyData(block: Block): string[] {
  const prose = block.k === 'table'
    ? [block.caption, ...block.head, ...block.rows.flat()]
    : block.k === 'ul' || block.k === 'ol'
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
  return prose.flatMap((s) => s.match(/SA-\d{4}-\d{3}|#\d+|\d+(?:[.,]\d+)*|\b(?:Qa|MRd|Mz|mx|Iy|Iz|MITC4|MITC9)\b|P-Δ|Y–Z|X–Y|[+≤%]/g) ?? []).sort();
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
      expect(safetyData(block), `${locale}: block ${index}`).toEqual(safetyData(post.i18n.en.blocks[index]));
      const source = post.i18n.en.blocks[index];
      if (block.k === 'ext' && source.k === 'ext') expect(block.href).toBe(source.href);
      if (block.k === 'link' && source.k === 'link') expect(block.slug).toBe(source.slug);
    });
  });
});
