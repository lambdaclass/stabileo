import { describe, it, expect } from 'vitest';
import { cirsocPage } from '../pages/cirsoc';
import { STANDING_PAGES } from '../pages';
import { findPost } from '..';

const LOCALES = (Object.keys(cirsocPage.i18n) as (keyof typeof cirsocPage.i18n)[]).filter((l) => cirsocPage.i18n[l]);

describe('the CIRSOC page', () => {
  it('says the same in every language: same blocks, same table rows, same questions', () => {
    const shape = (l: (typeof LOCALES)[number]) =>
      cirsocPage.i18n[l]!.blocks.map((b) =>
        b.k === 'table' ? `table:${b.head.length}x${b.rows.length}` : b.k === 'ul' ? `ul:${b.items.length}` : b.k === 'link' ? `link:${b.slug}` : b.k,
      );
    for (const l of LOCALES) {
      expect(shape(l), l).toEqual(shape('en'));
      expect(cirsocPage.i18n[l]!.faq.length, l).toBe(cirsocPage.i18n.en.faq.length);
    }
  });

  it('has a description a search result shows whole, and a lead and FAQ with text', () => {
    for (const l of LOCALES) {
      const b = cirsocPage.i18n[l]!;
      expect(b.description.length, l).toBeLessThanOrEqual(160);
      expect(b.lead.trim().length, l).toBeGreaterThan(100);
      for (const f of b.faq) expect(f.q.trim() && f.a.trim(), l).toBeTruthy();
    }
  });

  it('links only to posts that exist', () => {
    for (const l of LOCALES) {
      for (const b of cirsocPage.i18n[l]!.blocks) if (b.k === 'link') expect(findPost(b.slug), b.slug).toBeTruthy();
    }
  });

  it('keeps steel labelled experimental and names the CIRSOC 201 editions, in every language', () => {
    const experimental: Record<string, RegExp> = { de: /experimentell/i, fr: /expérimental/i, tr: /deneysel/i };
    for (const l of LOCALES) {
      const text = JSON.stringify(cirsocPage.i18n[l]);
      expect(text).toMatch(experimental[l] ?? /experimental/);
      expect(text).toMatch(/2025/);
      expect(text).toMatch(/2005/); // the edition the engine is compared with, and selectable for older projects
    }
  });
});

describe('every standing page', () => {
  for (const page of STANDING_PAGES) {
    it(`${page.path}: same structure in every language, descriptions that fit, links that exist`, () => {
      const shape = (l: (typeof LOCALES)[number]) =>
        page.i18n[l]!.blocks.map((b) =>
          b.k === 'table' ? `table:${b.head.length}x${b.rows.length}` : b.k === 'ul' ? `ul:${b.items.length}` : b.k === 'link' ? `link:${b.slug}` : b.k === 'ext' ? `ext:${b.href}` : b.k,
        );
      for (const l of LOCALES.filter((code) => page.i18n[code])) {
        expect(shape(l), l).toEqual(shape('en'));
        expect(page.i18n[l]!.faq.length, l).toBe(page.i18n.en.faq.length);
        expect(page.i18n[l]!.description.length, `${l} description`).toBeLessThanOrEqual(160);
        for (const b of page.i18n[l]!.blocks) if (b.k === 'link') expect(findPost(b.slug), b.slug).toBeTruthy();
      }
    });
  }
});
